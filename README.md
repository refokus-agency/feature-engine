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

  onSetup(selectors, { deps }) {
    // Runs once. Return value becomes `ctx` in onEach.
    // `deps` holds the values exposed by features listed in `dependencies`.
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
| `timeout` | `number \| null` | no | `null` | Max ms for lifecycle execution. Must be positive. `null` inherits the global `timeout` passed to `loadFeatures` (default `10000`) — it does **not** mean "no limit" |
| `onSetup` | `OnSetupFn` | * | | Runs once with `(selectors, { deps, root, signal })`. Return `false` to abort; any other value becomes `ctx` |
| `onEach` | `OnEachFn` | * | | Runs per matched element. Not allowed with `global: true`. May return (or resolve to) a cleanup function for that element |
| `onReady` | `OnReadyFn` | no | | Runs after all `onEach` calls complete. Receives `{ ctx, signal, root }` |
| `expose` | `ExposeFn \| null` | no | `null` | Runs last, after `onReady`, with `ctx`. Its return value is published under this feature's `id` and handed to dependents as `deps[id]` in `onSetup` |
| `onDestroy` | `OnDestroyFn \| null` | no | `null` | Feature-wide teardown. Receives `{ ctx, signal, root }`; `signal` is always already aborted by then and `ctx` may be `undefined` or partial. Runs only under `createFeatureRuntime`, never under `loadFeatures` — see [Teardown](#teardown) |

\* At least one of `onSetup` or `onEach` is required.

### `loadFeatures(features, options?): Promise<void>`

Loads and executes features in dependency order.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `10000` | Global timeout in ms, used by every feature whose own `timeout` is `null` (a feature-level `timeout` overrides it). `0` disables the timeout globally; negative or `NaN` values fall back to `10000` |
| `logging` | `boolean` | `true` | Enable/disable console warnings |
| `root` | `Document \| Element` | `document` | Container that scopes feature matching and `onEach` element queries. Only descendants of `root` are searched |

**Behavior:**

1. **Match** — global features always match (they ignore `root`); others require at least one selector matching a descendant of `root`
2. **Sort** — topological sort by dependencies, then by priority
3. **Load** — lazy-import all matched features in parallel (`Promise.allSettled`)
4. **Execute** — group features into priority waves. Features within each wave run in parallel (`Promise.allSettled`), respecting inter-feature dependencies via a dependency gate. Waves execute sequentially (lower priority first). A feature is **promoted** into the wave of its dependency whenever that dependency sits in a later wave, regardless of the feature's own `priority`. If a dependency fails, its dependents are skipped

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
  ├─ onSetup(selectors, { deps, root, signal })  → runs once; receives matched selectors,
  │    │                                            the exposed values of its dependencies,
  │    │                                            the loader root and the abort signal
  │    ├─ returns false      → abort (skip onEach, onReady + expose)
  │    └─ returns ctx        → passed to onEach, onReady and expose
  │
  ├─ onEach({ el, index, elements, ctx, root, signal })  → runs per matched element;
  │                                                        may return a cleanup for it
  │
  ├─ onReady({ ctx, signal, root })  → runs after all elements processed
  │
  ├─ expose(ctx)             → runs last; return value is published as deps[id]
  │                            for dependents, then the feature is marked ready
  │
  └─ onDestroy({ ctx, signal, root })  → feature-wide teardown, together with the
                                         onEach cleanups (createFeatureRuntime only;
                                         loadFeatures never runs them)
```

`ctx` in `onReady` is the value returned by `onSetup` (`undefined` when `onSetup` is absent), so state collected per mount can live there instead of in module-level variables. An `onReady()` that ignores its argument keeps working.

For **global features** (`global: true`): only `onSetup`, `onReady` and `expose` run. `onEach` is not allowed.

**Wave promotion.** Features run in waves keyed by `priority`, lowest first. If a feature depends on one placed in a later wave, it is promoted into that wave regardless of its own `priority` (the loader logs a warning when this happens). Priority orders independent features; dependencies always win.

### Sharing state between features: `dependencies` → `expose` → `deps`

```ts
// src/features/lenis.feature.js
export default defineFeature({
  id: 'lenis',
  selectors: [],
  priority: 0,
  global: true,

  onSetup() {
    return { lenis: new Lenis() };
  },

  expose(ctx) {
    return ctx.lenis; // published under the id "lenis"
  },
});

// src/features/scroll-animations.feature.js
export default defineFeature({
  id: 'scroll-animations',
  selectors: ['[data-animate]'],
  priority: 20,
  dependencies: ['lenis'],

  onSetup(selectors, { deps }) {
    const lenis = deps.lenis; // the value returned by lenis's expose()
    return { lenis };
  },
});
```

A feature without `expose` publishes nothing, and its dependents see no entry for it. If a dependency fails, its dependents are skipped.

### Querying the DOM from hooks

`onSetup` and `onEach` receive `root`: the container passed to `loadFeatures` (or `document` when no `root` option was given). Hooks must query through `root` or `el` instead of `document`, so a feature only touches elements inside the container it was loaded for. This matters during page transitions, when the outgoing and incoming containers are both in the DOM.

```ts
onEach: ({ el, root }) => {
  // ✅ scoped to the current container
  const duplicates = root.querySelectorAll(`#${el.id}`);
  // ❌ reaches into every container on the page
  // document.querySelectorAll(`#${el.id}`);
},
```

**Descendants only:** `root` is searched with `root.querySelector` / `root.querySelectorAll`, which never return the `root` element itself. A selector that matches only the container does not match the feature. To target the container, put the selector on a child element of the container instead.

### Cancelling work with `signal`

`onSetup`, `onEach` and `onReady` receive the same `AbortSignal`, one per feature. It follows the feature's lifetime: it is aborted when the feature stops being alive, and never because the feature finished mounting. Pass it to anything that accepts one, so listeners and requests are released together with the feature:

```ts
onSetup: (_selectors, { signal }) => {
  window.addEventListener('resize', onResize, { signal });
},
```

The signal is aborted when:

- the feature's `timeout` elapses;
- a hook (or `expose`) throws;
- `onSetup` returns `false`.

A feature that completes is never aborted, whatever its timeout (including `0`, disabled), so under `loadFeatures` its signal stays live for the rest of the page. `expose` does not receive the signal.

Registering a listener on an already-aborted signal is a no-op, and a timed-out run keeps executing in the background until it reaches the next hook boundary. Check `signal.aborted` before starting work that has no `signal` option. `signal.reason` is not part of the stable API: do not branch on it.

### Teardown

Resources a feature registers can be released by the feature itself: return a cleanup function from `onEach` for per-element resources, and declare `onDestroy({ ctx, signal, root })` for feature-wide ones. Both run only when features are mounted with `createFeatureRuntime`; `loadFeatures` never invokes them. See [docs/teardown.md](docs/teardown.md).

## Types

All types are exported from the main entry point:

```ts
import type {
  FeatureDescriptor,       // Frozen runtime descriptor
  FeatureDescriptorInput,  // Input shape for defineFeature()
  FeatureMeta,             // Metadata + lazy loader (used by loadFeatures)
  LoaderOptions,           // Options for loadFeatures()
  OnSetupFn,               // (selectors: string[], context: OnSetupContext) => unknown | false | Promise<...>
  OnSetupContext,          // { deps, root, signal }
  OnEachFn,                // (ctx: FeatureEachContext) => void | OnEachCleanup | Promise<void | OnEachCleanup>
  OnEachCleanup,           // () => unknown (return value ignored)
  OnReadyFn,               // (context: OnReadyContext) => void | Promise<void>
  OnReadyContext,          // { ctx, signal, root }
  OnDestroyFn,             // (context: OnDestroyContext) => unknown (return value ignored)
  OnDestroyContext,        // { ctx, signal, root }
  FeatureEachContext,       // { el, index, elements, ctx, root, signal }
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
