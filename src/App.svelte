<script>
  import Child from "./Child.svelte";
  import { setInput } from "./modules/shinyHelper";
  import { onMount } from "svelte";

  export let name;

  let foo = "foo"
  let bar = 0;

  // only sends data to Shiny server when client-side rendering with bundle.js
  $: (function (input, value) {
      setInput(input, value);
  })(foo, bar);

  onMount(() => bar = 100);

</script>

<style>
  h1 {
    color: purple;
  }

  div.content-container {
      padding: 20px;
  }

  div.child {
      border: 1px solid black;
  }

  /*
   * The remaining styles are derived from Tailwind CSS:
   * https://v1.tailwindcss.com/components/flexbox-grids
   */

  .bg-gray-400 {
      --bg-opacity: 1 !important;
      background-color: #cbd5e0 !important;
      background-color: rgba(203,213,224,var(--bg-opacity)) !important;
  }

  .bg-gray-500 {
      --bg-opacity: 1 !important;
      background-color: #a0aec0 !important;
      background-color: rgba(160,174,192,var(--bg-opacity)) !important;
  }

  .flex {
      display: flex !important;
  }

  .flex-wrap {
      flex-wrap: wrap !important;
  }

  .ml-auto {
      margin-left: auto !important;
  }

  .mr-auto {
      margin-right: auto !important;
  }

  .w-1\/2 {
      width: 50% !important;
  }
</style>

<div class="flex flex-wrap">

    <div class="w-1/2 ml-auto bg-gray-400">
        <div class="content-container">
            <h1>Hello {name}!</h1>

            <!-- input "foo" only sends data to Shiny server when client-side rendering with bundle.js -->
            <input name="foo" type="range" bind:value={bar} min={100} max={200} step={10}><br />
            value({bar}){(bar > 0) ? "" : " ...data/value only updates when client-side rendering with bundle.js"}<br />

            <!--
              -- Shiny native slider binding
              -->
            <!--<script src="shared/ionrangeslider/js/ion.rangeSlider.min.js"></script>-->
            <!--<script src="shared/strftime/strftime-min.js"></script>-->
            <!--<link href="shared/ionrangeslider/css/ion.rangeSlider.css" rel="stylesheet" />-->
            <!--<div class="form-group shiny-input-container">-->
            <!--    <label class="control-label" id="foo-label" for="foo">value</label>-->
            <!--    <input class="js-range-slider" id="foo" data-skin="shiny" data-min="100" data-max="200" data-from="100" data-step="10" data-grid="true" data-grid-num="10" data-grid-snap="false" data-prettify-separator="," data-prettify-enabled="true" data-keyboard="true" data-data-type="number"/>-->
            <!--</div>-->

            <div id="plot1" class="shiny-plot-output"
                 style="width: 100%; height: 300px"></div>
        </div>
    </div>

    <div class="w-1/2 mr-auto bg-gray-500">
        <div class="child content-container">
            <Child id="plot2" />
        </div>
    </div>

</div>
