# Prerender Svelte app at build-time

This is a minimal example of how to prerender the UI defined by Svelte into an `html` file that will be served by your Shiny app.

## Get started

Install the dependencies

```bash
npm install
```

Build

```bash
npm run build
```

Run via npm ...

```bash
npm run start
```

... or open `app.R` in RStudio and use the tool button to start the Shiny app server.

Navigate to [localhost:4321](http://localhost:4321). You should see your app running

## How it works

Rollup config consists of two separate configs:

The first config used to build usual iife bundle with app.

The second config used to build root component as [SSR component](https://svelte.dev/docs#Server-side_component_API). When SSR component bundled, Rollup executes script `prerender.js`, which uses SSR Component API to get HTML and CSS.

## Remarks

It's experimental example. Maybe there is a more simple way.
