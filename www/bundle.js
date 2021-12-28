var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                for (let j = 0; j < node.attributes.length; j += 1) {
                    const attribute = node.attributes[j];
                    if (!attributes[attribute.name])
                        node.removeAttribute(attribute.name);
                }
                return nodes.splice(i, 1)[0]; // TODO strip unwanted attributes
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/Child.svelte generated by Svelte v3.12.1 */

    const file = "src/Child.svelte";

    function add_css() {
    	var style = element("style");
    	style.id = 'svelte-1nfql8t-style';
    	style.textContent = "h2.svelte-1nfql8t{color:orange;font-weight:bold}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2hpbGQuc3ZlbHRlIiwic291cmNlcyI6WyJDaGlsZC5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdD5cbiAgICBleHBvcnQgbGV0IGlkID0gXCJwbG90XCI7XG48L3NjcmlwdD5cblxuPHN0eWxlPlxuICBoMiB7XG4gICAgY29sb3I6IG9yYW5nZTtcbiAgICBmb250LXdlaWdodDogYm9sZDtcbiAgfVxuPC9zdHlsZT5cblxuPGgyPkNoaWxkIGNvbXBvbmVudCBjb250ZW50PC9oMj5cblxuPHA+XG4gICAgPGxhYmVsPkRpc3RyaWJ1dGlvbiB0eXBlOjwvbGFiZWw+PGJyIC8+XG4gICAgPHNlbGVjdCBuYW1lPVwiZGlzdFwiPlxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9ybVwiPk5vcm1hbDwvb3B0aW9uPlxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwidW5pZlwiPlVuaWZvcm08L29wdGlvbj5cbiAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxub3JtXCI+TG9nLW5vcm1hbDwvb3B0aW9uPlxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXhwXCI+RXhwb25lbnRpYWw8L29wdGlvbj5cbiAgICA8L3NlbGVjdD5cbjwvcD5cblxuPHA+XG4gICAgPGxhYmVsPk51bWJlciBvZiBvYnNlcnZhdGlvbnM6PC9sYWJlbD48YnIgLz5cbiAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIG5hbWU9XCJuXCIgdmFsdWU9XCI1MDBcIiBtaW49XCIxXCIgbWF4PVwiMTAwMFwiIC8+XG48L3A+XG5cbjxoMz5TdW1tYXJ5IG9mIGRhdGE6PC9oMz5cbjxwcmUgaWQ9XCJzdW1tYXJ5XCIgY2xhc3M9XCJzaGlueS10ZXh0LW91dHB1dFwiPjwvcHJlPlxuXG48aDM+UGxvdCBvZiBkYXRhOjwvaDM+XG5cbjxkaXYgaWQ9XCJ7aWR9XCIgY2xhc3M9XCJzaGlueS1wbG90LW91dHB1dFwiXG4gICAgIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMzAwcHhcIj48L2Rpdj5cblxuPGgzPkhlYWQgb2YgZGF0YTo8L2gzPlxuPGRpdiBpZD1cInRhYmxlXCIgY2xhc3M9XCJzaGlueS1odG1sLW91dHB1dFwiPjwvZGl2PlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUtFLEVBQUUsZUFBQyxDQUFDLEFBQ0YsS0FBSyxDQUFFLE1BQU0sQ0FDYixXQUFXLENBQUUsSUFBSSxBQUNuQixDQUFDIn0= */";
    	append_dev(document.head, style);
    }

    function create_fragment(ctx) {
    	var h2, t0, t1, p0, label0, t2, br0, t3, select, option0, t4, option1, t5, option2, t6, option3, t7, t8, p1, label1, t9, br1, t10, input, t11, h30, t12, t13, pre, t14, h31, t15, t16, div0, t17, h32, t18, t19, div1;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			t0 = text("Child component content");
    			t1 = space();
    			p0 = element("p");
    			label0 = element("label");
    			t2 = text("Distribution type:");
    			br0 = element("br");
    			t3 = space();
    			select = element("select");
    			option0 = element("option");
    			t4 = text("Normal");
    			option1 = element("option");
    			t5 = text("Uniform");
    			option2 = element("option");
    			t6 = text("Log-normal");
    			option3 = element("option");
    			t7 = text("Exponential");
    			t8 = space();
    			p1 = element("p");
    			label1 = element("label");
    			t9 = text("Number of observations:");
    			br1 = element("br");
    			t10 = space();
    			input = element("input");
    			t11 = space();
    			h30 = element("h3");
    			t12 = text("Summary of data:");
    			t13 = space();
    			pre = element("pre");
    			t14 = space();
    			h31 = element("h3");
    			t15 = text("Plot of data:");
    			t16 = space();
    			div0 = element("div");
    			t17 = space();
    			h32 = element("h3");
    			t18 = text("Head of data:");
    			t19 = space();
    			div1 = element("div");
    			this.h();
    		},

    		l: function claim(nodes) {
    			h2 = claim_element(nodes, "H2", { class: true }, false);
    			var h2_nodes = children(h2);

    			t0 = claim_text(h2_nodes, "Child component content");
    			h2_nodes.forEach(detach_dev);
    			t1 = claim_space(nodes);

    			p0 = claim_element(nodes, "P", {}, false);
    			var p0_nodes = children(p0);

    			label0 = claim_element(p0_nodes, "LABEL", {}, false);
    			var label0_nodes = children(label0);

    			t2 = claim_text(label0_nodes, "Distribution type:");
    			label0_nodes.forEach(detach_dev);

    			br0 = claim_element(p0_nodes, "BR", {}, false);
    			var br0_nodes = children(br0);

    			br0_nodes.forEach(detach_dev);
    			t3 = claim_space(p0_nodes);

    			select = claim_element(p0_nodes, "SELECT", { name: true }, false);
    			var select_nodes = children(select);

    			option0 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option0_nodes = children(option0);

    			t4 = claim_text(option0_nodes, "Normal");
    			option0_nodes.forEach(detach_dev);

    			option1 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option1_nodes = children(option1);

    			t5 = claim_text(option1_nodes, "Uniform");
    			option1_nodes.forEach(detach_dev);

    			option2 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option2_nodes = children(option2);

    			t6 = claim_text(option2_nodes, "Log-normal");
    			option2_nodes.forEach(detach_dev);

    			option3 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option3_nodes = children(option3);

    			t7 = claim_text(option3_nodes, "Exponential");
    			option3_nodes.forEach(detach_dev);
    			select_nodes.forEach(detach_dev);
    			p0_nodes.forEach(detach_dev);
    			t8 = claim_space(nodes);

    			p1 = claim_element(nodes, "P", {}, false);
    			var p1_nodes = children(p1);

    			label1 = claim_element(p1_nodes, "LABEL", {}, false);
    			var label1_nodes = children(label1);

    			t9 = claim_text(label1_nodes, "Number of observations:");
    			label1_nodes.forEach(detach_dev);

    			br1 = claim_element(p1_nodes, "BR", {}, false);
    			var br1_nodes = children(br1);

    			br1_nodes.forEach(detach_dev);
    			t10 = claim_space(p1_nodes);

    			input = claim_element(p1_nodes, "INPUT", { type: true, name: true, value: true, min: true, max: true }, false);
    			var input_nodes = children(input);

    			input_nodes.forEach(detach_dev);
    			p1_nodes.forEach(detach_dev);
    			t11 = claim_space(nodes);

    			h30 = claim_element(nodes, "H3", {}, false);
    			var h30_nodes = children(h30);

    			t12 = claim_text(h30_nodes, "Summary of data:");
    			h30_nodes.forEach(detach_dev);
    			t13 = claim_space(nodes);

    			pre = claim_element(nodes, "PRE", { id: true, class: true }, false);
    			var pre_nodes = children(pre);

    			pre_nodes.forEach(detach_dev);
    			t14 = claim_space(nodes);

    			h31 = claim_element(nodes, "H3", {}, false);
    			var h31_nodes = children(h31);

    			t15 = claim_text(h31_nodes, "Plot of data:");
    			h31_nodes.forEach(detach_dev);
    			t16 = claim_space(nodes);

    			div0 = claim_element(nodes, "DIV", { id: true, class: true, style: true }, false);
    			var div0_nodes = children(div0);

    			div0_nodes.forEach(detach_dev);
    			t17 = claim_space(nodes);

    			h32 = claim_element(nodes, "H3", {}, false);
    			var h32_nodes = children(h32);

    			t18 = claim_text(h32_nodes, "Head of data:");
    			h32_nodes.forEach(detach_dev);
    			t19 = claim_space(nodes);

    			div1 = claim_element(nodes, "DIV", { id: true, class: true }, false);
    			var div1_nodes = children(div1);

    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},

    		h: function hydrate() {
    			attr_dev(h2, "class", "svelte-1nfql8t");
    			add_location(h2, file, 11, 0, 119);
    			add_location(label0, file, 14, 4, 161);
    			add_location(br0, file, 14, 37, 194);
    			option0.__value = "norm";
    			option0.value = option0.__value;
    			add_location(option0, file, 16, 8, 234);
    			option1.__value = "unif";
    			option1.value = option1.__value;
    			add_location(option1, file, 17, 8, 279);
    			option2.__value = "lnorm";
    			option2.value = option2.__value;
    			add_location(option2, file, 18, 8, 325);
    			option3.__value = "exp";
    			option3.value = option3.__value;
    			add_location(option3, file, 19, 8, 375);
    			attr_dev(select, "name", "dist");
    			add_location(select, file, 15, 4, 205);
    			add_location(p0, file, 13, 0, 153);
    			add_location(label1, file, 24, 4, 444);
    			add_location(br1, file, 24, 42, 482);
    			attr_dev(input, "type", "number");
    			attr_dev(input, "name", "n");
    			input.value = "500";
    			attr_dev(input, "min", "1");
    			attr_dev(input, "max", "1000");
    			add_location(input, file, 25, 4, 493);
    			add_location(p1, file, 23, 0, 436);
    			add_location(h30, file, 28, 0, 563);
    			attr_dev(pre, "id", "summary");
    			attr_dev(pre, "class", "shiny-text-output");
    			add_location(pre, file, 29, 0, 589);
    			add_location(h31, file, 31, 0, 641);
    			attr_dev(div0, "id", ctx.id);
    			attr_dev(div0, "class", "shiny-plot-output");
    			set_style(div0, "width", "100%");
    			set_style(div0, "height", "300px");
    			add_location(div0, file, 33, 0, 665);
    			add_location(h32, file, 36, 0, 754);
    			attr_dev(div1, "id", "table");
    			attr_dev(div1, "class", "shiny-html-output");
    			add_location(div1, file, 37, 0, 777);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			append_dev(h2, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p0, anchor);
    			append_dev(p0, label0);
    			append_dev(label0, t2);
    			append_dev(p0, br0);
    			append_dev(p0, t3);
    			append_dev(p0, select);
    			append_dev(select, option0);
    			append_dev(option0, t4);
    			append_dev(select, option1);
    			append_dev(option1, t5);
    			append_dev(select, option2);
    			append_dev(option2, t6);
    			append_dev(select, option3);
    			append_dev(option3, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, label1);
    			append_dev(label1, t9);
    			append_dev(p1, br1);
    			append_dev(p1, t10);
    			append_dev(p1, input);
    			insert_dev(target, t11, anchor);
    			insert_dev(target, h30, anchor);
    			append_dev(h30, t12);
    			insert_dev(target, t13, anchor);
    			insert_dev(target, pre, anchor);
    			insert_dev(target, t14, anchor);
    			insert_dev(target, h31, anchor);
    			append_dev(h31, t15);
    			insert_dev(target, t16, anchor);
    			insert_dev(target, div0, anchor);
    			insert_dev(target, t17, anchor);
    			insert_dev(target, h32, anchor);
    			append_dev(h32, t18);
    			insert_dev(target, t19, anchor);
    			insert_dev(target, div1, anchor);
    		},

    		p: function update(changed, ctx) {
    			if (changed.id) {
    				attr_dev(div0, "id", ctx.id);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(h2);
    				detach_dev(t1);
    				detach_dev(p0);
    				detach_dev(t8);
    				detach_dev(p1);
    				detach_dev(t11);
    				detach_dev(h30);
    				detach_dev(t13);
    				detach_dev(pre);
    				detach_dev(t14);
    				detach_dev(h31);
    				detach_dev(t16);
    				detach_dev(div0);
    				detach_dev(t17);
    				detach_dev(h32);
    				detach_dev(t19);
    				detach_dev(div1);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { id = "plot" } = $$props;

    	const writable_props = ['id'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Child> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    	};

    	$$self.$capture_state = () => {
    		return { id };
    	};

    	$$self.$inject_state = $$props => {
    		if ('id' in $$props) $$invalidate('id', id = $$props.id);
    	};

    	return { id };
    }

    class Child extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1nfql8t-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, ["id"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "Child", options, id: create_fragment.name });
    	}

    	get id() {
    		throw new Error("<Child>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Child>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    // Shiny Helper functions
    function setInput(input, value) {
      if (typeof Shiny !== "undefined" && typeof Shiny.setInputValue === "function") {
        console.log('Shiny.setInputValue("', input, '", "', value, '")');
        Shiny.setInputValue(input, value); // simple value update; no event for same value

        Shiny.setInputValue(input, value, {
          priority: "event"
        }); // value update with "event" priority for observeEvent
      }
    }

    /* src/App.svelte generated by Svelte v3.12.1 */

    const file$1 = "src/App.svelte";

    function add_css$1() {
    	var style = element("style");
    	style.id = 'svelte-1ujzflh-style';
    	style.textContent = "h1.svelte-1ujzflh{color:purple}div.content-container.svelte-1ujzflh{padding:20px}div.child.svelte-1ujzflh{border:1px solid black}.bg-gray-400.svelte-1ujzflh{--bg-opacity:1 !important;background-color:#cbd5e0 !important;background-color:rgba(203,213,224,var(--bg-opacity)) !important}.bg-gray-500.svelte-1ujzflh{--bg-opacity:1 !important;background-color:#a0aec0 !important;background-color:rgba(160,174,192,var(--bg-opacity)) !important}.flex.svelte-1ujzflh{display:flex !important}.flex-wrap.svelte-1ujzflh{flex-wrap:wrap !important}.ml-auto.svelte-1ujzflh{margin-left:auto !important}.mr-auto.svelte-1ujzflh{margin-right:auto !important}.w-1\\/2.svelte-1ujzflh{width:50% !important}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXBwLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgQ2hpbGQgZnJvbSBcIi4vQ2hpbGQuc3ZlbHRlXCI7XG4gIGltcG9ydCB7IHNldElucHV0IH0gZnJvbSBcIi4vbW9kdWxlcy9zaGlueUhlbHBlclwiO1xuICBpbXBvcnQgeyBvbk1vdW50IH0gZnJvbSBcInN2ZWx0ZVwiO1xuXG4gIGV4cG9ydCBsZXQgbmFtZTtcblxuICBsZXQgZm9vID0gXCJmb29cIlxuICBsZXQgYmFyID0gMDtcblxuICAvLyBvbmx5IHNlbmRzIGRhdGEgdG8gU2hpbnkgc2VydmVyIHdoZW4gY2xpZW50LXNpZGUgcmVuZGVyaW5nIHdpdGggYnVuZGxlLmpzXG4gICQ6IChmdW5jdGlvbiAoaW5wdXQsIHZhbHVlKSB7XG4gICAgICBzZXRJbnB1dChpbnB1dCwgdmFsdWUpO1xuICB9KShmb28sIGJhcik7XG5cbiAgb25Nb3VudCgoKSA9PiBiYXIgPSAxMDApO1xuXG48L3NjcmlwdD5cblxuPHN0eWxlPlxuICBoMSB7XG4gICAgY29sb3I6IHB1cnBsZTtcbiAgfVxuXG4gIGRpdi5jb250ZW50LWNvbnRhaW5lciB7XG4gICAgICBwYWRkaW5nOiAyMHB4O1xuICB9XG5cbiAgZGl2LmNoaWxkIHtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIGJsYWNrO1xuICB9XG5cbiAgLypcbiAgICogVGhlIHJlbWFpbmluZyBzdHlsZXMgYXJlIGRlcml2ZWQgZnJvbSBUYWlsd2luZCBDU1M6XG4gICAqIGh0dHBzOi8vdjEudGFpbHdpbmRjc3MuY29tL2NvbXBvbmVudHMvZmxleGJveC1ncmlkc1xuICAgKi9cblxuICAuYmctZ3JheS00MDAge1xuICAgICAgLS1iZy1vcGFjaXR5OiAxICFpbXBvcnRhbnQ7XG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjY2JkNWUwICFpbXBvcnRhbnQ7XG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDIwMywyMTMsMjI0LHZhcigtLWJnLW9wYWNpdHkpKSAhaW1wb3J0YW50O1xuICB9XG5cbiAgLmJnLWdyYXktNTAwIHtcbiAgICAgIC0tYmctb3BhY2l0eTogMSAhaW1wb3J0YW50O1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogI2EwYWVjMCAhaW1wb3J0YW50O1xuICAgICAgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgxNjAsMTc0LDE5Mix2YXIoLS1iZy1vcGFjaXR5KSkgIWltcG9ydGFudDtcbiAgfVxuXG4gIC5mbGV4IHtcbiAgICAgIGRpc3BsYXk6IGZsZXggIWltcG9ydGFudDtcbiAgfVxuXG4gIC5mbGV4LXdyYXAge1xuICAgICAgZmxleC13cmFwOiB3cmFwICFpbXBvcnRhbnQ7XG4gIH1cblxuICAubWwtYXV0byB7XG4gICAgICBtYXJnaW4tbGVmdDogYXV0byAhaW1wb3J0YW50O1xuICB9XG5cbiAgLm1yLWF1dG8ge1xuICAgICAgbWFyZ2luLXJpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7XG4gIH1cblxuICAudy0xXFwvMiB7XG4gICAgICB3aWR0aDogNTAlICFpbXBvcnRhbnQ7XG4gIH1cbjwvc3R5bGU+XG5cbjxkaXYgY2xhc3M9XCJmbGV4IGZsZXgtd3JhcFwiPlxuXG4gICAgPGRpdiBjbGFzcz1cInctMS8yIG1sLWF1dG8gYmctZ3JheS00MDBcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRlbnQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICA8aDE+SGVsbG8ge25hbWV9ITwvaDE+XG5cbiAgICAgICAgICAgIDwhLS0gaW5wdXQgXCJmb29cIiBvbmx5IHNlbmRzIGRhdGEgdG8gU2hpbnkgc2VydmVyIHdoZW4gY2xpZW50LXNpZGUgcmVuZGVyaW5nIHdpdGggYnVuZGxlLmpzIC0tPlxuICAgICAgICAgICAgPGlucHV0IG5hbWU9XCJmb29cIiB0eXBlPVwicmFuZ2VcIiBiaW5kOnZhbHVlPXtiYXJ9IG1pbj17MTAwfSBtYXg9ezIwMH0gc3RlcD17MTB9PjxiciAvPlxuICAgICAgICAgICAgdmFsdWUoe2Jhcn0peyhiYXIgPiAwKSA/IFwiXCIgOiBcIiAuLi5kYXRhL3ZhbHVlIG9ubHkgdXBkYXRlcyB3aGVuIGNsaWVudC1zaWRlIHJlbmRlcmluZyB3aXRoIGJ1bmRsZS5qc1wifTxiciAvPlxuXG4gICAgICAgICAgICA8IS0tXG4gICAgICAgICAgICAgIC0tIFNoaW55IG5hdGl2ZSBzbGlkZXIgYmluZGluZ1xuICAgICAgICAgICAgICAtLT5cbiAgICAgICAgICAgIDwhLS08c2NyaXB0IHNyYz1cInNoYXJlZC9pb25yYW5nZXNsaWRlci9qcy9pb24ucmFuZ2VTbGlkZXIubWluLmpzXCI+PC9zY3JpcHQ+LS0+XG4gICAgICAgICAgICA8IS0tPHNjcmlwdCBzcmM9XCJzaGFyZWQvc3RyZnRpbWUvc3RyZnRpbWUtbWluLmpzXCI+PC9zY3JpcHQ+LS0+XG4gICAgICAgICAgICA8IS0tPGxpbmsgaHJlZj1cInNoYXJlZC9pb25yYW5nZXNsaWRlci9jc3MvaW9uLnJhbmdlU2xpZGVyLmNzc1wiIHJlbD1cInN0eWxlc2hlZXRcIiAvPi0tPlxuICAgICAgICAgICAgPCEtLTxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHNoaW55LWlucHV0LWNvbnRhaW5lclwiPi0tPlxuICAgICAgICAgICAgPCEtLSAgICA8bGFiZWwgY2xhc3M9XCJjb250cm9sLWxhYmVsXCIgaWQ9XCJmb28tbGFiZWxcIiBmb3I9XCJmb29cIj52YWx1ZTwvbGFiZWw+LS0+XG4gICAgICAgICAgICA8IS0tICAgIDxpbnB1dCBjbGFzcz1cImpzLXJhbmdlLXNsaWRlclwiIGlkPVwiZm9vXCIgZGF0YS1za2luPVwic2hpbnlcIiBkYXRhLW1pbj1cIjEwMFwiIGRhdGEtbWF4PVwiMjAwXCIgZGF0YS1mcm9tPVwiMTAwXCIgZGF0YS1zdGVwPVwiMTBcIiBkYXRhLWdyaWQ9XCJ0cnVlXCIgZGF0YS1ncmlkLW51bT1cIjEwXCIgZGF0YS1ncmlkLXNuYXA9XCJmYWxzZVwiIGRhdGEtcHJldHRpZnktc2VwYXJhdG9yPVwiLFwiIGRhdGEtcHJldHRpZnktZW5hYmxlZD1cInRydWVcIiBkYXRhLWtleWJvYXJkPVwidHJ1ZVwiIGRhdGEtZGF0YS10eXBlPVwibnVtYmVyXCIvPi0tPlxuICAgICAgICAgICAgPCEtLTwvZGl2Pi0tPlxuXG4gICAgICAgICAgICA8ZGl2IGlkPVwicGxvdDFcIiBjbGFzcz1cInNoaW55LXBsb3Qtb3V0cHV0XCJcbiAgICAgICAgICAgICAgICAgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweFwiPjwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cblxuICAgIDxkaXYgY2xhc3M9XCJ3LTEvMiBtci1hdXRvIGJnLWdyYXktNTAwXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjaGlsZCBjb250ZW50LWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgPENoaWxkIGlkPVwicGxvdDJcIiAvPlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cblxuPC9kaXY+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBb0JFLEVBQUUsZUFBQyxDQUFDLEFBQ0YsS0FBSyxDQUFFLE1BQU0sQUFDZixDQUFDLEFBRUQsR0FBRyxrQkFBa0IsZUFBQyxDQUFDLEFBQ25CLE9BQU8sQ0FBRSxJQUFJLEFBQ2pCLENBQUMsQUFFRCxHQUFHLE1BQU0sZUFBQyxDQUFDLEFBQ1AsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxBQUMzQixDQUFDLEFBT0QsWUFBWSxlQUFDLENBQUMsQUFDVixZQUFZLENBQUUsRUFBRSxVQUFVLENBQzFCLGdCQUFnQixDQUFFLE9BQU8sQ0FBQyxVQUFVLENBQ3BDLGdCQUFnQixDQUFFLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLFVBQVUsQUFDcEUsQ0FBQyxBQUVELFlBQVksZUFBQyxDQUFDLEFBQ1YsWUFBWSxDQUFFLEVBQUUsVUFBVSxDQUMxQixnQkFBZ0IsQ0FBRSxPQUFPLENBQUMsVUFBVSxDQUNwQyxnQkFBZ0IsQ0FBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxVQUFVLEFBQ3BFLENBQUMsQUFFRCxLQUFLLGVBQUMsQ0FBQyxBQUNILE9BQU8sQ0FBRSxJQUFJLENBQUMsVUFBVSxBQUM1QixDQUFDLEFBRUQsVUFBVSxlQUFDLENBQUMsQUFDUixTQUFTLENBQUUsSUFBSSxDQUFDLFVBQVUsQUFDOUIsQ0FBQyxBQUVELFFBQVEsZUFBQyxDQUFDLEFBQ04sV0FBVyxDQUFFLElBQUksQ0FBQyxVQUFVLEFBQ2hDLENBQUMsQUFFRCxRQUFRLGVBQUMsQ0FBQyxBQUNOLFlBQVksQ0FBRSxJQUFJLENBQUMsVUFBVSxBQUNqQyxDQUFDLEFBRUQsT0FBTyxlQUFDLENBQUMsQUFDTCxLQUFLLENBQUUsR0FBRyxDQUFDLFVBQVUsQUFDekIsQ0FBQyJ9 */";
    	append_dev(document.head, style);
    }

    function create_fragment$1(ctx) {
    	var div5, div2, div1, h1, t0, t1, t2, t3, input, br0, t4, t5, t6, t7_value = (ctx.bar > 0) ? "" : " ...data/value only updates when client-side rendering with bundle.js" + "", t7, br1, t8, div0, t9, div4, div3, current, dispose;

    	var child = new Child({ props: { id: "plot2" }, $$inline: true });

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			h1 = element("h1");
    			t0 = text("Hello ");
    			t1 = text(ctx.name);
    			t2 = text("!");
    			t3 = space();
    			input = element("input");
    			br0 = element("br");
    			t4 = text("\n            value(");
    			t5 = text(ctx.bar);
    			t6 = text(")");
    			t7 = text(t7_value);
    			br1 = element("br");
    			t8 = space();
    			div0 = element("div");
    			t9 = space();
    			div4 = element("div");
    			div3 = element("div");
    			child.$$.fragment.c();
    			this.h();
    		},

    		l: function claim(nodes) {
    			div5 = claim_element(nodes, "DIV", { class: true }, false);
    			var div5_nodes = children(div5);

    			div2 = claim_element(div5_nodes, "DIV", { class: true }, false);
    			var div2_nodes = children(div2);

    			div1 = claim_element(div2_nodes, "DIV", { class: true }, false);
    			var div1_nodes = children(div1);

    			h1 = claim_element(div1_nodes, "H1", { class: true }, false);
    			var h1_nodes = children(h1);

    			t0 = claim_text(h1_nodes, "Hello ");
    			t1 = claim_text(h1_nodes, ctx.name);
    			t2 = claim_text(h1_nodes, "!");
    			h1_nodes.forEach(detach_dev);
    			t3 = claim_space(div1_nodes);

    			input = claim_element(div1_nodes, "INPUT", { name: true, type: true, min: true, max: true, step: true }, false);
    			var input_nodes = children(input);

    			input_nodes.forEach(detach_dev);

    			br0 = claim_element(div1_nodes, "BR", {}, false);
    			var br0_nodes = children(br0);

    			br0_nodes.forEach(detach_dev);
    			t4 = claim_text(div1_nodes, "\n            value(");
    			t5 = claim_text(div1_nodes, ctx.bar);
    			t6 = claim_text(div1_nodes, ")");
    			t7 = claim_text(div1_nodes, t7_value);

    			br1 = claim_element(div1_nodes, "BR", {}, false);
    			var br1_nodes = children(br1);

    			br1_nodes.forEach(detach_dev);
    			t8 = claim_space(div1_nodes);

    			div0 = claim_element(div1_nodes, "DIV", { id: true, class: true, style: true }, false);
    			var div0_nodes = children(div0);

    			div0_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			t9 = claim_space(div5_nodes);

    			div4 = claim_element(div5_nodes, "DIV", { class: true }, false);
    			var div4_nodes = children(div4);

    			div3 = claim_element(div4_nodes, "DIV", { class: true }, false);
    			var div3_nodes = children(div3);

    			child.$$.fragment.l(div3_nodes);
    			div3_nodes.forEach(detach_dev);
    			div4_nodes.forEach(detach_dev);
    			div5_nodes.forEach(detach_dev);
    			this.h();
    		},

    		h: function hydrate() {
    			attr_dev(h1, "class", "svelte-1ujzflh");
    			add_location(h1, file$1, 74, 12, 1390);
    			attr_dev(input, "name", "foo");
    			attr_dev(input, "type", "range");
    			attr_dev(input, "min", 100);
    			attr_dev(input, "max", 200);
    			attr_dev(input, "step", 10);
    			add_location(input, file$1, 77, 12, 1533);
    			add_location(br0, file$1, 77, 90, 1611);
    			add_location(br1, file$1, 78, 114, 1732);
    			attr_dev(div0, "id", "plot1");
    			attr_dev(div0, "class", "shiny-plot-output");
    			set_style(div0, "width", "100%");
    			set_style(div0, "height", "300px");
    			add_location(div0, file$1, 91, 12, 2585);
    			attr_dev(div1, "class", "content-container svelte-1ujzflh");
    			add_location(div1, file$1, 73, 8, 1346);
    			attr_dev(div2, "class", "w-1/2 ml-auto bg-gray-400 svelte-1ujzflh");
    			add_location(div2, file$1, 72, 4, 1298);
    			attr_dev(div3, "class", "child content-container svelte-1ujzflh");
    			add_location(div3, file$1, 97, 8, 2765);
    			attr_dev(div4, "class", "w-1/2 mr-auto bg-gray-500 svelte-1ujzflh");
    			add_location(div4, file$1, 96, 4, 2717);
    			attr_dev(div5, "class", "flex flex-wrap svelte-1ujzflh");
    			add_location(div5, file$1, 70, 0, 1264);

    			dispose = [
    				listen_dev(input, "change", ctx.input_change_input_handler),
    				listen_dev(input, "input", ctx.input_change_input_handler)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div2);
    			append_dev(div2, div1);
    			append_dev(div1, h1);
    			append_dev(h1, t0);
    			append_dev(h1, t1);
    			append_dev(h1, t2);
    			append_dev(div1, t3);
    			append_dev(div1, input);

    			set_input_value(input, ctx.bar);

    			append_dev(div1, br0);
    			append_dev(div1, t4);
    			append_dev(div1, t5);
    			append_dev(div1, t6);
    			append_dev(div1, t7);
    			append_dev(div1, br1);
    			append_dev(div1, t8);
    			append_dev(div1, div0);
    			append_dev(div5, t9);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			mount_component(child, div3, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if (!current || changed.name) {
    				set_data_dev(t1, ctx.name);
    			}

    			if (changed.bar) set_input_value(input, ctx.bar);

    			if (!current || changed.bar) {
    				set_data_dev(t5, ctx.bar);
    			}

    			if ((!current || changed.bar) && t7_value !== (t7_value = (ctx.bar > 0) ? "" : " ...data/value only updates when client-side rendering with bundle.js" + "")) {
    				set_data_dev(t7, t7_value);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(child.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(child.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div5);
    			}

    			destroy_component(child);

    			run_all(dispose);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$1.name, type: "component", source: "", ctx });
    	return block;
    }

    let foo = "foo";

    function instance$1($$self, $$props, $$invalidate) {
    	

      let { name } = $$props;
      let bar = 0;

      onMount(() => $$invalidate('bar', bar = 100));

    	const writable_props = ['name'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input_change_input_handler() {
    		bar = to_number(this.value);
    		$$invalidate('bar', bar);
    	}

    	$$self.$set = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    	};

    	$$self.$capture_state = () => {
    		return { name, foo, bar };
    	};

    	$$self.$inject_state = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('foo' in $$props) $$invalidate('foo', foo = $$props.foo);
    		if ('bar' in $$props) $$invalidate('bar', bar = $$props.bar);
    	};

    	$$self.$$.update = ($$dirty = { foo: 1, bar: 1 }) => {
    		if ($$dirty.foo || $$dirty.bar) { (function (input, value) {
              setInput(input, value);
          })(foo, bar); }
    	};

    	return { name, bar, input_change_input_handler };
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1ujzflh-style")) add_css$1();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["name"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "App", options, id: create_fragment$1.name });

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.name === undefined && !('name' in props)) {
    			console.warn("<App> was created without expected prop 'name'");
    		}
    	}

    	get name() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var target = document.getElementById("app");
    target.innerHTML = "";
    var app = new App({
      target: target,
      props: {
        name: "world"
      },
      hydrate: true
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
