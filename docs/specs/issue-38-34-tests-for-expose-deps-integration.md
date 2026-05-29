---
issue_number: 38
issue_title: "[#34] Tests for `expose` + `deps` integration"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "feat/38-tests-for-expose-deps-integration"
base_branch: "feat/37-validate-expose-in-definefeature"
epic: 34
created_at: "2026-05-29T11:59:32-03:00"
---

# Implementation Plan: #38 — [#34] Tests for `expose` + `deps` integration

Final sub-issue of epic #34. Adds **integration tests** that exercise the real
`defineFeature` → `loadFeatures` path end-to-end. The prior sub-issues' tests build
`FeatureDescriptor` objects directly (via `makeLoadable`), bypassing `defineFeature`; #38's value is
the **integration seam** — descriptors built by `defineFeature`, so the freeze pass-through
(`expose: descriptor.expose || null`, added in #36/#37) is actually proven to carry `expose` through
to the loader. A test of this kind would have caught the original "freeze omits expose" gap flagged
in #35's review.

**Branch:** `feat/38-tests-for-expose-deps-integration`, **stacked on `feat/37-...`** (PR #42, open).
Test-only; no production changes. Merge order: #40 → #41 → #42 → #38.

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/__tests__/loader.test.ts` | Add a `defineLoadable` helper (defineFeature input → loadable `FeatureMeta`) and an `expose + deps integration (#38)` describe block with the 8 AC tests run through `defineFeature` + `loadFeatures`. Add the `defineFeature` import and the `FeatureDescriptorInput` type import. |

## Codebase Context

- **Prior expose tests (#36 block)** build `FeatureDescriptor` directly via `makeLoadable`, bypassing
  `defineFeature`. #38 deliberately goes **through** `defineFeature` so the freeze pass-through and
  validation are exercised — covering the seam #36 could not.
- **`FeatureMeta`** = `{ id, selectors, priority, global, dependencies, timeout, load }`. `loadFeatures`
  uses META fields for matching/waves/dependency-gating and the **descriptor** (from `load()`) for the
  lifecycle. The helper must mirror the meta fields from the `defineFeature` output so meta/descriptor
  stay in sync.
- **`defineFeature` requires `onSetup` or `onEach`** (validation) → every #38 feature has a lifecycle
  hook. The "expose-only / no-onSetup" case is **not constructible** via `defineFeature` and is
  correctly absent here (it lives in #36's loader-level tests).
- **`global: true` forbids `onEach`** (defineFeature validation) → global features in these tests use
  `onSetup` only; the one lifecycle/regression test (AC-8) uses a selector + `onEach`.
- **Patterns to reuse:** vitest + jsdom; explicit `.ts` imports; `vi.fn()` hooks; capture order/deps
  inside callbacks; `vi.spyOn(console, 'warn').mockImplementation(noop)` in `beforeEach` for warning,
  failure, and circular-dependency assertions; `vi.restoreAllMocks()` per test.

## Steps

1. **Add the `defineLoadable` helper** to `src/__tests__/loader.test.ts`:
   ```ts
   function defineLoadable(
     input: FeatureDescriptorInput,
     metaOverrides: Partial<FeatureMeta> = {},
   ): FeatureMeta {
     const descriptor = defineFeature(input);
     return {
       id: descriptor.id,
       selectors: [...descriptor.selectors],
       priority: descriptor.priority,
       global: descriptor.global,
       dependencies: [...descriptor.dependencies],
       timeout: descriptor.timeout,
       load: () => Promise.resolve({ default: descriptor }),
       ...metaOverrides,
     };
   }
   ```
   Add `import { defineFeature } from '../define-feature.ts';` and extend the type import with
   `FeatureDescriptorInput`.
   **Done when:** `defineLoadable({...})` returns a `FeatureMeta` whose `load()` resolves the real
   `defineFeature` descriptor, with meta fields mirrored from it; `npm run check-types` passes.

2. **Add the `describe('loadFeatures — expose + deps integration (#38)')` block** with the 8 AC tests
   (AC-1..AC-8 below), all via `defineLoadable` + `loadFeatures`, with a `warnSpy` `beforeEach`.
   **Done when:** the 8 tests exist and `npm test` passes.

3. **Build gate.**
   **Done when:** `npm run check-types`, `npm test`, and `npm run build` all pass.

## Interfaces

- None (test-only). Uses existing `FeatureDescriptorInput` and `FeatureMeta`.

## Function Design

- `loader.test.ts` `defineLoadable` — single concern: turn a `defineFeature` input into a loadable
  `FeatureMeta` (real descriptor + synced meta). No production code.

## Acceptance Criteria (EARS)

- **AC-1.** When a feature with `expose` is loaded via `defineFeature` → `loadFeatures`, its
  dependent's `onSetup` shall receive the exposed value in `deps[id]`. [from issue]
- **AC-2.** When a dependency has no `expose`, the dependent's `deps[id]` shall be `undefined`. [from issue]
- **AC-3.** If a feature's `onSetup` returns `false`, then `expose` shall not be called and dependents'
  `deps[id]` shall be `undefined`. [from issue]
- **AC-4.** When a dependency fails, the dependent shall be skipped (existing behavior preserved). [from issue]
- **AC-5.** When two features form a circular dependency, the cycle shall be pruned and both shall
  still run (existing behavior preserved). [from issue]
- **AC-6.** When a feature depends transitively (A→B→C), only DIRECT dependencies shall be visible in
  `deps` (C sees B, not A). [from issue]
- **AC-7.** If a feature's `expose` throws, then it shall be treated as failed and its dependents
  skipped. [from issue]
- **AC-8.** A feature without `expose`/`dependencies` shall behave exactly as before
  (`onSetup` → `onEach` → `onReady`). [from issue]

## Out of Scope

- Any production-code change (loader/types/define-feature are delivered in #35/#36/#37).
- The "expose with no `onSetup`" case (not constructible via `defineFeature`; covered at loader level in #36).
- New test helpers beyond `defineLoadable`.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Circular A↔B through `defineFeature` deps | [from issue] | topoSort prunes one edge; no deadlock; both `onSetup`s run; circular warn asserted (AC-5). |
| 2 | Transitive A→B→C | [from issue] | C's `deps` has only B's key; A absent (only direct `validDeps`) (AC-6). |
| 3 | `onSetup` throws (failed dependency) | [from issue] | producer → `failedIds`; dependent skipped; `dependency "…" failed` warn (AC-4). |
| 4 | `expose` throws | [from issue] | producer → `failedIds` (rejection through the awaited `expose`); dependent skipped (AC-7). |
| 5 | Plain feature, no `expose`/`deps` | [from issue] | `onSetup` → `onEach` → `onReady` unaffected; proves no regression (AC-8). |
| 6 | `global: true` + `expose` | [inferred] | Works through `defineFeature` (`onSetup` present; `onEach` not used for global). |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| expose value delivery (integration) | AC-1, AC-2, AC-3, AC-6 |
| failure / cycle semantics (integration) | AC-4, AC-5, AC-7 |
| no regression | AC-8 |
| Build integrity | `npm run check-types` + `npm test` + `npm run build` all pass |

## Risks

- **Overlap with #36's loader-unit tests** → mitigate: #38 deliberately routes through `defineFeature`
  (the integration seam #36 bypassed), so it is not redundant; it proves the freeze + validation +
  loader compose correctly. Noted in Codebase Context.
- **Stacked on `feat/37`** (unmerged, PR #42) → mitigate: base = `feat/37`; merge order
  #40 → #41 → #42 → #38. Test-only, so conflict risk is low.

## Test Strategy

- All 8 tests via `defineLoadable(defineFeatureInput, metaOverrides)` + `loadFeatures`. Use global
  features where possible (no DOM); AC-8 uses a selector + `onEach` (set `document.body.innerHTML`) to
  prove the full `onSetup` → `onEach` → `onReady` lifecycle is intact.
- Capture exposed values / `deps` INSIDE the dependent's `onSetup` callback (real delivery at call
  time, not a post-run map read).
- `warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop)` in `beforeEach`; assert
  `expect.stringContaining(...)` for circular (AC-5) and failure (AC-4/AC-7) warnings.
- Concrete shapes:
  - AC-1: producer `onSetup: () => ({ token: 'x' })`, `expose: (ctx) => ctx`; consumer `dependencies: ['producer']`, captures `deps['producer']` → `{ token: 'x' }`.
  - AC-2: producer `onSetup` only (no `expose`) → consumer `deps['producer']` `undefined`.
  - AC-3: producer `onSetup: () => false` + `expose: vi.fn()` → `expose` not called; consumer `deps['producer']` `undefined`.
  - AC-4: producer `onSetup` throws → consumer `onSetup` not called; failure warn.
  - AC-5: A `dependencies: ['b']`, B `dependencies: ['a']` → both `onSetup`s run; circular warn.
  - AC-6: A `expose`, B `dependencies: ['a']` + `expose`, C `dependencies: ['b']` → C's `deps` keys = `['b']`.
  - AC-7: producer `expose: () => { throw }` → consumer skipped; failure warn.
  - AC-8: feature with selector + `onSetup`/`onEach`/`onReady` (no expose/deps) → all hooks fire in order with correct `ctx`.
- Gate: `npm run check-types` (`-p tsconfig.eslint.json`, includes tests) + `npm test` + `npm run build`.
