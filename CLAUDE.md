# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@refokus-agency/feature-engine` — a declarative feature-loading system with code splitting for Webflow projects. Features are authored as isolated `*.feature.js` modules; the engine handles DOM matching, dependency resolution (topological sort), and lifecycle execution with per-feature lazy imports. Published to GitHub Packages.

## Commands

```bash
npm test                  # Run all tests once (vitest run)
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npx vitest run src/__tests__/loader.test.ts   # Run a single test file
npx vitest run -t "name"  # Run tests matching a name

npm run check-types       # Type-check only (tsc --noEmit --strict)
npm run lint              # ESLint with --fix (lint:report for no-fix)
npm run build             # Compile to dist/ (tsc)
npm run build:clean       # rm -rf dist && build
npm run bench             # Run benchmarks (src/**/*.bench.ts)
```

Requires Node >= 24 (see `.nvmrc`). The package is ESM-only (`"type": "module"`).

## Architecture

Three independent pieces, each maps to a phase of the system:

1. **`src/define-feature.ts`** — `defineFeature(descriptor)`. Author-time. Validates input exhaustively (throws on bad shape) and returns a deep-frozen, normalized `FeatureDescriptor`. This is the runtime half — it includes the lifecycle hook functions.

2. **`src/vite/`** — the build-time half. `featureMetadataPlugin` (in `index.ts`) scans `src/features/**/*.feature.js`, and for each file `parse-feature-file.ts` extracts metadata **statically via acorn AST parsing** — never by executing the module. It only reads literal values (`extractLiteralValue` handles string/number/bool/string-arrays/negative-number-unary); any non-literal value causes the whole file to be skipped with a warning. The plugin emits a `virtual:feature-metadata` module: an array of `FeatureMeta` objects each carrying the static metadata plus a `load: () => import(filePath)` lazy loader. This split (static metadata eagerly available, hook code lazily imported) is what enables code splitting — `loadFeatures` can decide what to run before any feature chunk is downloaded.

3. **`src/loader.ts`** — runtime. `loadFeatures(features, options)` orchestrates:
   - **Match** (`matchFeatures`): `global` features always match; others need at least one selector present in the DOM.
   - **Sort** (`topoSort`): DFS topological sort by `dependencies`; circular edges are pruned (not fatal) and recorded in `prunedEdges`.
   - **Load** (`loadChunks`): all matched chunks lazy-imported in parallel via `Promise.allSettled`; load failures are recorded in `failedIds`.
   - **Execute** (`groupIntoWaves` + `dispatchWaves`): features grouped into **priority waves**. A feature can be *promoted* to a later wave if it depends on something in a later wave. Waves run sequentially (lower priority first); features **within** a wave run in parallel via `Promise.allSettled`, gated by a `DependencyGate` (`createDependencyGate`) that resolves promises as each dependency's `markReady` fires. A feature whose dependency failed is skipped and itself marked failed (cascading).

`FeatureMeta` (build-time/runtime metadata + loader) and `FeatureDescriptor` (frozen runtime descriptor with hooks) are distinct types — keep them separate. All public types live in `src/types.ts`; both `parse-feature-file.ts` and `index.ts` re-export their own plugin-side types.

### Feature lifecycle

`onSetup(selectors)` → `onEach({ el, index, elements, ctx })` per element → `onReady()`. `onSetup` returning `false` aborts the feature (skips `onEach`/`onReady`); any other return becomes `ctx`. Global features run `onSetup`/`onReady` only — `onEach` is rejected at `defineFeature` time. Execution respects `AbortSignal` (driven by `withTimeout`) and checks `signal.aborted` between every hook.

## Conventions

- **Imports use explicit `.ts` extensions** (e.g. `from './types.ts'`) — required by `rewriteRelativeImportExtensions` in tsconfig. Match this when adding files.
- Two package entry points: `.` (main: `defineFeature`, `loadFeatures`, types) and `./vite` (`featureMetadataPlugin`). Keep the runtime entry free of Node built-ins — `node:fs`/`node:path` belong only under `src/vite/`.
- Errors from validation are thrown with `[defineFeature]` / `[featureMetadataPlugin]` prefixes; loader uses non-throwing `[loader]` `console.warn` (suppressible via `logging: false`). Preserve these patterns.
- Tests live in `src/__tests__/` (`*.test.ts`, `*.smoke.test.ts`, `*.bench.ts`), run under `jsdom` with vitest globals enabled (no need to import `describe`/`it`/`expect`).

## Releases

Automated via semantic-release on push to `main` (`.releaserc.json`). Commits **must** follow Conventional Commits — use `npm run commit` (commitizen) for the wizard. Version bumps, CHANGELOG, and the GitHub Packages publish are all driven by commit messages; do not bump versions manually.
