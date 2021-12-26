const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const minify = require("html-minifier").minify;

const App = require(path.resolve(process.cwd(), "src/.temp/ssr.js"));

const { html, css } = App.render({
  authenticated: true, // set to true to ignore auth state
  name: 'world'
});

const template = fs.readFileSync(
  path.resolve(process.cwd(), "www/index.html"),
  "utf-8"
);

const minifiedHtml = minify(html, {
  collapseWhitespace: true
});

const result = template.replace(
  "<!-- PRERENDER -->",
  `<style>${css.code}</style>${minifiedHtml}`
);

fs.writeFileSync(path.resolve(process.cwd(), "www/index.html"), result);
rimraf.sync(path.resolve(process.cwd(), "src/.temp"));
