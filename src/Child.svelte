<script>
    export let id = "plot";
</script>

<style>
  h2 {
    color: orange;
    font-weight: bold;
  }
</style>

<h2>Child component content</h2>

<p>
    <label>Distribution type:</label><br />
    <select name="dist">
        <option value="norm">Normal</option>
        <option value="unif">Uniform</option>
        <option value="lnorm">Log-normal</option>
        <option value="exp">Exponential</option>
    </select>
</p>

<p>
    <label>Number of observations:</label><br />
    <input type="number" name="n" value="500" min="1" max="1000" />
</p>

<h3>Summary of data:</h3>
<pre id="summary" class="shiny-text-output"></pre>

<h3>Plot of data:</h3>

<div id="{id}" class="shiny-plot-output"
     style="width: 100%; height: 300px"></div>

<h3>Head of data:</h3>
<div id="table" class="shiny-html-output"></div>
