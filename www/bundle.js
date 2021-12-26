var app = (function () {
    'use strict';

    function noop() { }
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
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
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
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
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

    /* src/Child.svelte generated by Svelte v3.12.1 */

    function add_css() {
    	var style = element("style");
    	style.id = 'svelte-o3w3k6-style';
    	style.textContent = "h2.svelte-o3w3k6{color:red;font-weight:bold}";
    	append(document.head, style);
    }

    function create_fragment(ctx) {
    	var h2, t0, t1, p0, label0, t2, br0, t3, select, option0, t4, option1, t5, option2, t6, option3, t7, t8, p1, label1, t9, br1, t10, input, t11, h30, t12, t13, pre, t14, h31, t15, t16, div0, t17, h32, t18, t19, div1;

    	return {
    		c() {
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

    		l(nodes) {
    			h2 = claim_element(nodes, "H2", { class: true }, false);
    			var h2_nodes = children(h2);

    			t0 = claim_text(h2_nodes, "Child component content");
    			h2_nodes.forEach(detach);
    			t1 = claim_space(nodes);

    			p0 = claim_element(nodes, "P", {}, false);
    			var p0_nodes = children(p0);

    			label0 = claim_element(p0_nodes, "LABEL", {}, false);
    			var label0_nodes = children(label0);

    			t2 = claim_text(label0_nodes, "Distribution type:");
    			label0_nodes.forEach(detach);

    			br0 = claim_element(p0_nodes, "BR", {}, false);
    			var br0_nodes = children(br0);

    			br0_nodes.forEach(detach);
    			t3 = claim_space(p0_nodes);

    			select = claim_element(p0_nodes, "SELECT", { name: true }, false);
    			var select_nodes = children(select);

    			option0 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option0_nodes = children(option0);

    			t4 = claim_text(option0_nodes, "Normal");
    			option0_nodes.forEach(detach);

    			option1 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option1_nodes = children(option1);

    			t5 = claim_text(option1_nodes, "Uniform");
    			option1_nodes.forEach(detach);

    			option2 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option2_nodes = children(option2);

    			t6 = claim_text(option2_nodes, "Log-normal");
    			option2_nodes.forEach(detach);

    			option3 = claim_element(select_nodes, "OPTION", { value: true }, false);
    			var option3_nodes = children(option3);

    			t7 = claim_text(option3_nodes, "Exponential");
    			option3_nodes.forEach(detach);
    			select_nodes.forEach(detach);
    			p0_nodes.forEach(detach);
    			t8 = claim_space(nodes);

    			p1 = claim_element(nodes, "P", {}, false);
    			var p1_nodes = children(p1);

    			label1 = claim_element(p1_nodes, "LABEL", {}, false);
    			var label1_nodes = children(label1);

    			t9 = claim_text(label1_nodes, "Number of observations:");
    			label1_nodes.forEach(detach);

    			br1 = claim_element(p1_nodes, "BR", {}, false);
    			var br1_nodes = children(br1);

    			br1_nodes.forEach(detach);
    			t10 = claim_space(p1_nodes);

    			input = claim_element(p1_nodes, "INPUT", { type: true, name: true, value: true, min: true, max: true }, false);
    			var input_nodes = children(input);

    			input_nodes.forEach(detach);
    			p1_nodes.forEach(detach);
    			t11 = claim_space(nodes);

    			h30 = claim_element(nodes, "H3", {}, false);
    			var h30_nodes = children(h30);

    			t12 = claim_text(h30_nodes, "Summary of data:");
    			h30_nodes.forEach(detach);
    			t13 = claim_space(nodes);

    			pre = claim_element(nodes, "PRE", { id: true, class: true }, false);
    			var pre_nodes = children(pre);

    			pre_nodes.forEach(detach);
    			t14 = claim_space(nodes);

    			h31 = claim_element(nodes, "H3", {}, false);
    			var h31_nodes = children(h31);

    			t15 = claim_text(h31_nodes, "Plot of data:");
    			h31_nodes.forEach(detach);
    			t16 = claim_space(nodes);

    			div0 = claim_element(nodes, "DIV", { id: true, class: true, style: true }, false);
    			var div0_nodes = children(div0);

    			div0_nodes.forEach(detach);
    			t17 = claim_space(nodes);

    			h32 = claim_element(nodes, "H3", {}, false);
    			var h32_nodes = children(h32);

    			t18 = claim_text(h32_nodes, "Head of data:");
    			h32_nodes.forEach(detach);
    			t19 = claim_space(nodes);

    			div1 = claim_element(nodes, "DIV", { id: true, class: true }, false);
    			var div1_nodes = children(div1);

    			div1_nodes.forEach(detach);
    			this.h();
    		},

    		h() {
    			attr(h2, "class", "svelte-o3w3k6");
    			option0.__value = "norm";
    			option0.value = option0.__value;
    			option1.__value = "unif";
    			option1.value = option1.__value;
    			option2.__value = "lnorm";
    			option2.value = option2.__value;
    			option3.__value = "exp";
    			option3.value = option3.__value;
    			attr(select, "name", "dist");
    			attr(input, "type", "number");
    			attr(input, "name", "n");
    			input.value = "500";
    			attr(input, "min", "1");
    			attr(input, "max", "1000");
    			attr(pre, "id", "summary");
    			attr(pre, "class", "shiny-text-output");
    			attr(div0, "id", "plot");
    			attr(div0, "class", "shiny-plot-output");
    			set_style(div0, "width", "100%");
    			set_style(div0, "height", "300px");
    			attr(div1, "id", "table");
    			attr(div1, "class", "shiny-html-output");
    		},

    		m(target, anchor) {
    			insert(target, h2, anchor);
    			append(h2, t0);
    			insert(target, t1, anchor);
    			insert(target, p0, anchor);
    			append(p0, label0);
    			append(label0, t2);
    			append(p0, br0);
    			append(p0, t3);
    			append(p0, select);
    			append(select, option0);
    			append(option0, t4);
    			append(select, option1);
    			append(option1, t5);
    			append(select, option2);
    			append(option2, t6);
    			append(select, option3);
    			append(option3, t7);
    			insert(target, t8, anchor);
    			insert(target, p1, anchor);
    			append(p1, label1);
    			append(label1, t9);
    			append(p1, br1);
    			append(p1, t10);
    			append(p1, input);
    			insert(target, t11, anchor);
    			insert(target, h30, anchor);
    			append(h30, t12);
    			insert(target, t13, anchor);
    			insert(target, pre, anchor);
    			insert(target, t14, anchor);
    			insert(target, h31, anchor);
    			append(h31, t15);
    			insert(target, t16, anchor);
    			insert(target, div0, anchor);
    			insert(target, t17, anchor);
    			insert(target, h32, anchor);
    			append(h32, t18);
    			insert(target, t19, anchor);
    			insert(target, div1, anchor);
    		},

    		p: noop,
    		i: noop,
    		o: noop,

    		d(detaching) {
    			if (detaching) {
    				detach(h2);
    				detach(t1);
    				detach(p0);
    				detach(t8);
    				detach(p1);
    				detach(t11);
    				detach(h30);
    				detach(t13);
    				detach(pre);
    				detach(t14);
    				detach(h31);
    				detach(t16);
    				detach(div0);
    				detach(t17);
    				detach(h32);
    				detach(t19);
    				detach(div1);
    			}
    		}
    	};
    }

    class Child extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-o3w3k6-style")) add_css();
    		init(this, options, null, create_fragment, safe_not_equal, []);
    	}
    }

    /* src/App.svelte generated by Svelte v3.12.1 */

    function add_css$1() {
    	var style = element("style");
    	style.id = 'svelte-1ucbz36-style';
    	style.textContent = "h1.svelte-1ucbz36{color:purple}";
    	append(document.head, style);
    }

    function create_fragment$1(ctx) {
    	var h1, t0, t1, t2, t3, current;

    	var child = new Child({});

    	return {
    		c() {
    			h1 = element("h1");
    			t0 = text("Hello ");
    			t1 = text(ctx.name);
    			t2 = text("!");
    			t3 = space();
    			child.$$.fragment.c();
    			this.h();
    		},

    		l(nodes) {
    			h1 = claim_element(nodes, "H1", { class: true }, false);
    			var h1_nodes = children(h1);

    			t0 = claim_text(h1_nodes, "Hello ");
    			t1 = claim_text(h1_nodes, ctx.name);
    			t2 = claim_text(h1_nodes, "!");
    			h1_nodes.forEach(detach);
    			t3 = claim_space(nodes);
    			child.$$.fragment.l(nodes);
    			this.h();
    		},

    		h() {
    			attr(h1, "class", "svelte-1ucbz36");
    		},

    		m(target, anchor) {
    			insert(target, h1, anchor);
    			append(h1, t0);
    			append(h1, t1);
    			append(h1, t2);
    			insert(target, t3, anchor);
    			mount_component(child, target, anchor);
    			current = true;
    		},

    		p(changed, ctx) {
    			if (!current || changed.name) {
    				set_data(t1, ctx.name);
    			}
    		},

    		i(local) {
    			if (current) return;
    			transition_in(child.$$.fragment, local);

    			current = true;
    		},

    		o(local) {
    			transition_out(child.$$.fragment, local);
    			current = false;
    		},

    		d(detaching) {
    			if (detaching) {
    				detach(h1);
    				detach(t3);
    			}

    			destroy_component(child, detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { name } = $$props;

    	$$self.$set = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    	};

    	return { name };
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1ucbz36-style")) add_css$1();
    		init(this, options, instance, create_fragment$1, safe_not_equal, ["name"]);
    	}
    }

    const target = document.getElementById("app");

    target.innerHTML = "";

    const app = new App({
      target,
      props: {
        name: "world"
      },
      hydrate: true
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
