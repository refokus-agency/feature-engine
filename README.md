# @refokus-agency/feature-engine

[![CI](https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml/badge.svg)](https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml)
[![npm version](https://img.shields.io/npm/v/@refokus-agency/feature-engine.svg)](https://www.npmjs.com/package/@refokus-agency/feature-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Declarative feature loading system with code splitting for Webflow projects. Define features as isolated modules, let the engine handle DOM matching, dependency resolution, and lifecycle execution.

## Why feature-engine?

Webflow lets you paste JavaScript straight into a site's or a page's custom code. That is fine for a handful of lines, but it gives you no build step — no npm packages, no TypeScript, no bundling — and the same snippet spread across twenty pages has no single source of truth, so it drifts. Anything beyond a handful of lines therefore moves into an external build, loaded site-wide as one bundle. That works, but every page then pays for every feature: a page with nothing but an accordion still downloads the video player, the scroll animations, and the cart logic.

The single bundle is the default for a good reason. Webflow components get copied between pages, and a copied component brings its markup and its `data-` attributes with it — but not its JavaScript. It only behaves correctly if the code that drives it is already loaded on the page it landed on. Shipping one bundle everywhere is the cheapest way to guarantee that.

feature-engine keeps the guarantee and drops the payload. Each feature declares the selectors it needs, and the loader reads the DOM of the page it is actually on, lazy-importing only the chunks whose selectors are present — features that have to run everywhere opt out of matching by declaring themselves `global`. There is no per-page or per-route configuration to maintain: copying a component to another page is enough, and its feature follows it.

It is built for Webflow developers who already have a Vite build in place. On a one-page site, a single bundle is fine — the benefit starts at two pages and grows with every feature that only some of them use.

## Installation

```bash
npm install @refokus-agency/feature-engine
```

Requires Node >= 24. The package is ESM-only; there is no CommonJS build.

## Quick start

### 1. Define a feature

Create a file per feature (e.g. `src/features/accordion.feature.js`):

```ts
import { defineFeature } from '@refokus-agency/feature-engine';

export default defineFeature({
  id: 'accordion',
  selectors: ['[data-feature="accordion"]'],
  priority: 10,

  onSetup(selectors) {
    // Runs once. Return value becomes `ctx` in onEach.
    // Return `false` to abort the feature entirely.
    return { openIndex: 0 };
  },

  onEach({ el, index, elements, ctx }) {
    // Runs for each matched DOM element.
    el.addEventListener('click', () => { /* ... */ });
  },

  onReady() {
    // Runs after all elements are processed.
  },
});
```

### 2. Register the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { featureMetadataPlugin } from '@refokus-agency/feature-engine/vite';

export default defineConfig({
  plugins: [
    featureMetadataPlugin(),
    // or with a custom glob:
    // featureMetadataPlugin({ include: 'modules/**/*.feature.js' }),
  ],
});
```

The plugin scans `src/features/**/*.feature.js` by default, extracts static metadata via AST, and exposes a virtual module with lazy loaders.

### 3. Load features at runtime

```ts
// src/main.ts
import { loadFeatures } from '@refokus-agency/feature-engine';
import features from 'virtual:feature-metadata';

loadFeatures(features, { timeout: 8000 });
```

That's it. The loader matches features against the current DOM, resolves dependencies via topological sort, and runs each feature's lifecycle with code splitting.

## Webflow integration

Webflow does not build your JavaScript, so the bundle is built outside Webflow, hosted somewhere public, and referenced from the site.

### 1. Build the bundle

`vite build` emits the entry script plus a chunk per feature, alongside any shared chunks Rollup splits out of them. Two settings matter here:

- **`base`** — the public URL the build will be served from. Chunk URLs are resolved against it; left at the default, the browser requests chunks from your Webflow domain, where they do not exist.
- **`entryFileNames`** — Vite hashes output filenames by default (`assets/main-a1b2c3.js`). You paste the entry URL into Webflow by hand, so pin that one filename. The feature chunks keep their hashes, which is what you want for cache busting.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { featureMetadataPlugin } from '@refokus-agency/feature-engine/vite';

export default defineConfig({
  base: 'https://assets.example.com/webflow/',
  plugins: [featureMetadataPlugin()],
  build: {
    rollupOptions: {
      output: { entryFileNames: 'main.js' },
    },
  },
});
```

### 2. Host the output

Hosting the built files is your own responsibility — Webflow only serves the site it builds for you. Upload the whole build output and keep its directory structure, since chunk URLs are resolved relative to `base`. Whatever you host it on must send `Access-Control-Allow-Origin` for the entry script **and** for every chunk. Chunks are fetched as separate cross-origin module requests, so a header on the entry script alone leaves every lazy import blocked.

### 3. Reference the entry script from Webflow

Add it to the site's custom code — **Site settings → Custom code**, in either the head or the footer field — or to a single page under **Page settings → Custom code**:

```html
<script type="module" src="https://assets.example.com/webflow/main.js"></script>
```

`type="module"` is required: the package is ESM-only and the loader pulls feature chunks in with dynamic `import()`. Module scripts are deferred, so either field works — the script runs after the page has been parsed, which is what the loader needs to match features against the DOM.

## API

### `defineFeature(descriptor): Readonly<FeatureDescriptor>`

Validates and freezes a feature descriptor. Throws on invalid input.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | yes | | Unique identifier |
| `selectors` | `string[]` | yes | | CSS selectors to match. Use `[]` for global features |
| `priority` | `number` | yes | | Lower values initialize first |
| `global` | `boolean` | no | `false` | Always loads regardless of DOM (skips selector matching) |
| `dependencies` | `string[]` | no | `[]` | Feature IDs that must complete before this one runs |
| `enabled` | `boolean` | no | `true` | Set `false` to disable without removing the file |
| `timeout` | `number \| null` | no | `null` | Max ms for lifecycle execution. `null` = no limit |
| `onSetup` | `OnSetupFn` | * | | Runs once. Return `false` to abort; any other value becomes `ctx` |
| `onEach` | `OnEachFn` | * | | Runs per matched element. Not allowed with `global: true` |
| `onReady` | `OnReadyFn` | no | | Runs after all `onEach` calls complete |

\* At least one of `onSetup` or `onEach` is required.

### `loadFeatures(features, options?): Promise<void>`

Loads and executes features in dependency order.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `10000` | Global timeout in ms (feature-level `timeout` overrides this) |
| `logging` | `boolean` | `true` | Enable/disable console warnings |

**Behavior:**

1. **Match** — global features always match; others require at least one selector present in the DOM
2. **Sort** — topological sort by dependencies, then by priority
3. **Load** — lazy-import all matched features in parallel (`Promise.allSettled`)
4. **Execute** — group features into priority waves. Features within each wave run in parallel (`Promise.allSettled`), respecting inter-feature dependencies via a dependency gate. Waves execute sequentially (lower priority first). If a dependency fails, its dependents are skipped

### `featureMetadataPlugin(options?): Plugin`

Vite plugin that generates the `virtual:feature-metadata` module.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string` | `features/**/*.feature.js` | Glob pattern relative to `src/` |

The plugin extracts metadata statically (AST parsing) — only literal values are supported in feature descriptors. Dynamic expressions will cause the file to be skipped with a warning.

Features with `enabled: false` and duplicate IDs are excluded. The virtual module provides hot-reload support in dev mode.

## Lifecycle

```
defineFeature()
  │
  ├─ onSetup(selectors)     → runs once, receives matched selectors
  │    ├─ returns false      → abort (skip onEach + onReady)
  │    └─ returns ctx        → passed to onEach
  │
  ├─ onEach({ el, index, elements, ctx })  → runs per matched element
  │
  └─ onReady()               → runs after all elements processed
```

For **global features** (`global: true`): only `onSetup` and `onReady` run. `onEach` is not allowed.

## Types

All types are exported from the main entry point:

```ts
import type {
  FeatureDescriptor,       // Frozen runtime descriptor
  FeatureDescriptorInput,  // Input shape for defineFeature()
  FeatureMeta,             // Metadata + lazy loader (used by loadFeatures)
  LoaderOptions,           // Options for loadFeatures()
  OnSetupFn,               // (selectors: string[]) => unknown | false | Promise<...>
  OnEachFn,                // (ctx: FeatureEachContext) => void | Promise<void>
  OnReadyFn,               // () => void | Promise<void>
  FeatureEachContext,       // { el, index, elements, ctx }
} from '@refokus-agency/feature-engine';
```

The Vite plugin entry exports:

```ts
import type {
  FeatureMetadataPluginOptions,
  ParsedFeatureMeta,
} from '@refokus-agency/feature-engine/vite';
```

## Examples

### Feature with dependencies

```ts
export default defineFeature({
  id: 'scroll-animations',
  selectors: ['[data-animate]'],
  priority: 20,
  dependencies: ['lenis'],

  onSetup() {
    return { timeline: gsap.timeline() };
  },

  onEach({ el, ctx }) {
    ctx.timeline.from(el, { opacity: 0 });
  },

  onReady() {
    ScrollTrigger.refresh();
  },
});
```

### Global feature (no DOM selectors)

```ts
export default defineFeature({
  id: 'analytics',
  selectors: [],
  priority: 0,
  global: true,

  onSetup() {
    initAnalytics();
  },
});
```

### Conditional abort

```ts
export default defineFeature({
  id: 'video-player',
  selectors: ['[data-video]'],
  priority: 15,

  onSetup() {
    if (window.innerWidth < 768) return false; // abort on mobile
    return { player: new VideoPlayer() };
  },

  onEach({ el, ctx }) {
    ctx.player.mount(el);
  },
});
```

## Development

```bash
npm run build          # Compile TypeScript
npm run build:clean    # Clean and rebuild
npm test               # Run tests
npm run typecheck      # Type checking
npm run lint           # Biome lint and autofix
npm run format         # Biome formatter
```

## Publishing

This package uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning via GitHub Actions. Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
npm run commit         # Commitizen wizard
```

Published to the public npm registry on push to `main`.

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the development setup, the verification chain to run before opening a pull request, and the commit conventions that drive releases.

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security vulnerability, follow [SECURITY.md](SECURITY.md) — never open a public issue for one.

## License

Licensed under the [Apache License 2.0](LICENSE). See also [NOTICE](NOTICE).
