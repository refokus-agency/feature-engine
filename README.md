# @refokus-agency/feature-engine

[![CI](https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml/badge.svg)](https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml)
[![npm version](https://img.shields.io/npm/v/@refokus-agency/feature-engine.svg)](https://www.npmjs.com/package/@refokus-agency/feature-engine)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Declarative feature loading system with code splitting for Webflow projects. Define features as isolated modules, let the engine handle DOM matching, dependency resolution, and lifecycle execution.

## Installation

```bash
npm install @refokus-agency/feature-engine
```

> Published to GitHub Packages under `@refokus-agency`. Configure your `.npmrc`:
>
> ```
> @refokus-agency:registry=https://npm.pkg.github.com
> ```

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
npm run lint           # Lint and fix
```

## Publishing

This package uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning via GitHub Actions. Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
npm run commit         # Commitizen wizard
```

Published to GitHub Packages on push to `main`.

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the development setup, the verification chain to run before opening a pull request, and the commit conventions that drive releases.

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security vulnerability, follow [SECURITY.md](SECURITY.md) — never open a public issue for one.

## License

Licensed under the [Apache License 2.0](LICENSE). See also [NOTICE](NOTICE).
