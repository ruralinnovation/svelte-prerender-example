<script>
  import Child from "./Child.svelte";
  import { setInput } from "./modules/shinyHelper";

  export let name;

  let value = 100;

  // only sends data to Shiny server when *not* using server-side rendering (ssr)
  $: (function (bar) {
      setInput("foo", bar);
  })(value);

</script>

<style>
  h1 {
    color: purple;
  }

  div.child {
      padding: 20px;
      border: 1px solid black;
  }
</style>

<h1>Hello {name}!</h1>

<!-- input "foo" only sends data to Shiny server when *not* using server-side rendering (ssr) -->
<input name="foo" type="range" bind:value={value} min={100} max={200} step={10}><br />
value({value})... data/value only updates when *not* using server-side rendering (ssr)

<!--&lt;!&ndash; Shiny native alternative &ndash;&gt;-->
<!--<script src="shared/ionrangeslider/js/ion.rangeSlider.min.js"></script>-->
<!--<script src="shared/strftime/strftime-min.js"></script>-->
<!--<link href="shared/ionrangeslider/css/ion.rangeSlider.css" rel="stylesheet" /-->
<!--<div class="form-group shiny-input-container">-->
<!--    <label class="control-label" id="foo-label" for="foo">value</label>-->
<!--    <input class="js-range-slider" id="foo" data-skin="shiny" data-min="100" data-max="200" data-from="100" data-step="10" data-grid="true" data-grid-num="10" data-grid-snap="false" data-prettify-separator="," data-prettify-enabled="true" data-keyboard="true" data-data-type="number"/>-->
<!--</div>-->

<div id="plot1" class="shiny-plot-output"
     style="width: 100%; height: 300px"></div>

<div class="child">
    <Child id="plot2" />
</div>
