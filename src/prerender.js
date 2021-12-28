const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const minify = require("html-minifier").minify;

const production = !process.env.NODE_ENV && !process.env.ROLLUP_WATCH;

(function (prod_value) {
    console.log("PRODUCTION: ", prod_value)
}(production));

const App = require(path.resolve(process.cwd(), "www/ssr.js"));

const { html, css } = App.render({
  authenticated: true, // set to true to ignore auth state
  name: 'world'
});

if (!!html) {

    const template = fs.readFileSync(
        path.resolve(process.cwd(), (!!production) ? "templates/index.html" : "templates/index-dev.html"),
        "utf-8"
    );
    console.log(template);

    const result = template.replace(
      "<!-- PRERENDER -->",
        // (!!production) ?
        //     `<style>${css.code}</style>${minify(html, { collapseWhitespace: true })}` :
            `
    <style>${css.code}</style>
    ${html}
`
    );

    console.log(result);

    fs.writeFileSync(path.resolve(process.cwd(), "www/index.html"), result);
    rimraf.sync(path.resolve(process.cwd(), "www/ssr.js"));
}
