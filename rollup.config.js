import babel from 'rollup-plugin-babel';
import svelte from "rollup-plugin-svelte";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import copy from 'rollup-plugin-copy';
import execute from "rollup-plugin-execute";
import html from "rollup-plugin-bundle-html";

// const production = !process.env.NODE_ENV && !process.env.ROLLUP_WATCH;
const production = !(process.argv.filter(arg => arg.match(/-w/) !== null).length > 0);

(function (prod_value) {
  console.log("PRODUCTION: ", prod_value)
}(production));

export default [
    // Normal Svelte client-side rendering via bundle.js ----
  {
    external: ['Shiny'],
    input: "src/main.js",
    output: {
      sourcemap: true,
      format: "iife",
      name: "app",
      file: "www/bundle.js"
    },
    plugins: [
      babel({
        "runtimeHelpers": true,
        "plugins": [
          "@babel/plugin-transform-async-to-generator",
          "@babel/plugin-transform-regenerator",
          ["@babel/plugin-transform-runtime", {
            "helpers": true,
            "regenerator": true
          }]
        ],
        "presets": [
          "@babel/preset-env"
        ],
        "exclude": "node_modules/**"
      }),

      commonjs(),

      copy({
        targets: [
          { src: 'static/*', dest: 'www/' }
        ]
      }),

      html({
        template: (!!production) ? "templates/index.html" : "templates/index-dev.html",
        dest: "www",
        filename: "index.html",
        inject: "body"
      }),

      resolve({
        browser: true,
        dedupe: importee =>
          importee === "svelte" || importee.startsWith("svelte/")
      }),

      svelte({
        dev: !production,
        hydratable: true
      }),

      // In dev mode, call `npm run start` once
      // the bundle has been generated
      !production && serve()
    ]
  },
  // Svelte server-side rendering, *no* dynamic content rendered by client/browser ----
  {
    external: ['Shiny'],
    input: "src/App.svelte",
    output: {
      format: "cjs",
      file: "www/ssr.js"
    },
    plugins: [
      babel({
        "runtimeHelpers": true,
        "plugins": [
          "@babel/plugin-transform-async-to-generator",
          "@babel/plugin-transform-regenerator",
          ["@babel/plugin-transform-runtime", {
            "helpers": true,
            "regenerator": true
          }]
        ],
        "presets": [
          "@babel/preset-env"
        ],
        "exclude": "node_modules/**"
      }),

      commonjs(),

      copy({
        targets: [
          { src: 'static/*', dest: 'www/' }
        ]
      }),

      resolve({
        browser: true,
        dedupe: importee =>
          importee === "svelte" || importee.startsWith("svelte/")
      }),

      svelte({
        // enable run-time checks when not in production
        dev: !production,
        generate: "ssr"
      }),

      execute("node src/prerender.js"),

      // In dev mode, call `npm run start` once
      // the bundle has been generated
      !production && serve()
    ]
  }
];

function serve() {
  let started = false;

  return {
    writeBundle() {
      if (!started) {
        started = true;

        require('child_process').spawn('npm', ['run', 'start'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  };
}
