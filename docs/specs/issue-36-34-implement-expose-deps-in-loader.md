---
issue_number: 36
issue_title: "[#34] Implement `expose` + `deps` in loader"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "feat/36-implement-expose-deps-in-loader"
base_branch: "feat/35-add-expose-and-onsetupcontext-types"
epic: 34
created_at: "2026-05-29T09:34:36-03:00"
---

# Implementation Plan: #36 — [#34] Implement `expose` + `deps` in loader

This is the **runtime wiring** sub-issue of epic #34. It implements the behavior whose type
surface was added in #35: the loader calls each feature's `expose(ctx)` after its lifecycle,
accumulates the results, and hands each feature a `deps` record of its direct dependencies'
exposed values.

**Branch:** `feat/36-implement-expose-deps-in-loader`, **stacked on `feat/35-...`** (PR #40, open
against the epic branch) because #36 depends on #35's types (`OnSetupContext`, the 2-arg
`OnSetupFn`, and `expose?` on the descriptors). It cannot be based on `main`/`feat/34` until #35
merges, so it stacks on `feat/35`.

**Scope decision (user-approved):** the `define-feature.ts` freeze pass-through gap (neither #36
nor #37 owned it) is **folded into #36** — `defineFeature({ expose })` must forward `expose` into
its frozen descriptor, otherwise the loader wiring is dead end-to-end. Runtime *validation* of
`expose` (throwing if not a function) remains #37; integration tests remain #38.

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/loader.ts` | Add `exposedValues: Map<string, unknown>` to `ExecutionContext` + init at construction (line ~379); in `runWithDeps` build a `deps` record from `exposedValues` filtered to `validDeps` and store the returned exposed value before resolving; in `initFeature` accept `deps`, forward it to `onSetup`, and call `expose(ctx)` after the lifecycle. |
| 2 | modify | `src/define-feature.ts` | **[folded scope]** Add `expose: descriptor.expose` to the `Object.freeze({ … })` allowlist so `defineFeature({ expose })` survives into the runtime descriptor. No validation (that is #37) — pass-through only. |
| 3 | modify | `src/__tests__/loader.test.ts` | Add AC-1..AC-7 + edge-case tests for the loader wiring (descriptors built directly via `makeLoadable` with an `expose` override). |
| 4 | modify | `src/__tests__/define-feature.test.ts` | Replace the #35 vacuous AC-1 runtime assertion with a real one: `expose` forwarded when provided, `undefined`/absent otherwise. |

## Codebase Context

- **`ExecutionContext`** is the interface at `src/loader.ts:18-23` (`knownIds`, `gate`,
  `prunedEdges`, `failedIds`, `warn`) and is constructed at `src/loader.ts:379`
  (`const ctx: ExecutionContext = { knownIds, gate, prunedEdges, failedIds, warn };`). The new
  `exposedValues` map is added in both places.
- **`markReady`** is called only in `dispatchWaves`'s `finally` block (`loader.ts:311`), which runs
  *after* `runWithDeps` resolves/rejects. Therefore storing the exposed value **inside
  `runWithDeps` before it returns** guarantees it lands before any dependent unblocks (AC-7).
- **`initFeature`** (`loader.ts:85-115`) is called from exactly one place — `runWithDeps:276`. Its
  current signature returns `Promise<void>`; it owns the `onSetup`/`onEach`/`onReady` lifecycle and
  already holds the `ctx` value (from `onSetup`) that `expose` consumes. Signal checks exist at
  lines 91/100/110 but **not** between `onReady` and the end — a guard must be added before `expose`.
- **`onSetup` call site** (`loader.ts:94-96`) currently passes the `{ deps: {} }` placeholder from
  #35 — this is what gets replaced with the real `deps` record.
- **`runWithDeps`** (`loader.ts:258-277`) awaits `validDeps` via the gate, and if any `validDep` is
  in `failedIds` it adds itself and returns early (skipping `initFeature`) — this preserves AC-4.
  **`validDeps`** (the pruned/validated *direct* dependency list on `LoadedFeature`) is the correct
  source for the `deps` record — not `descriptor.dependencies` (which includes pruned edges).
- **`failedIds`** is a single `Set` on `ctx`; `dispatchWaves`'s `catch` (line ~309) adds a feature
  on any throw/timeout from `runWithDeps`. So an `expose` that throws is naturally caught there
  (AC-5) as long as `expose` runs inside the awaited `initFeature` chain.
- **`define-feature.ts`** builds its descriptor via a field-by-field `Object.freeze({ … })`
  (lines ~109-120); `expose` is currently absent. Add it explicitly (no spread).
- **Tests** build `FeatureDescriptor` objects **directly** via `makeDescriptor`/`makeLoadable`
  (not through `defineFeature`), so loader tests can set `expose` as a descriptor override. Style:
  vitest + jsdom, explicit `.ts` imports, `vi.fn()` hooks, `order: string[]` for ordering asserts,
  `vi.spyOn(console,'warn')` for warning asserts.

## Steps

1. **Add `exposedValues` to `ExecutionContext`.** Declare `exposedValues: Map<string, unknown>` in
   the interface (`loader.ts:18-23`) and initialize `exposedValues: new Map()` in the `ctx` literal
   at `loader.ts:379`.
   **Done when:** the field is declared and present in the constructed `ctx`.

2. **Thread `deps` into `initFeature` and change its return type.** New signature:
   `initFeature(feature, selectors, deps: Record<string, unknown>, signal?): Promise<unknown>`.
   Replace the `{ deps: {} }` placeholder so `onSetup` receives the passed `deps`. All early-return
   paths (`enabled === false`, `signal?.aborted`, `onSetup` returned `false`) return `undefined`.
   **Done when:** `initFeature` accepts `deps`, forwards `{ deps }` to `onSetup`, and compiles.

3. **Call `expose` after the lifecycle (awaited).** In `initFeature`, after `onReady` and a fresh
   `if (signal?.aborted) return undefined;` guard, if `feature.expose` is defined
   `return await feature.expose(ctx);` (AWAIT — the type `(ctx:any)=>unknown` permits a Promise, and
   every other hook is awaited; not awaiting would store an unresolved Promise — see Risks). If
   `feature.expose` is not defined, return `undefined`. `expose` runs even when `onSetup` is `null`
   (`ctx` is `undefined` → `expose(undefined)`), but never when `onSetup` returned `false` (already
   returned) or the signal aborted. **All early-return sites must return** (bare `return;` = `undefined`
   under `Promise<unknown>`): `enabled===false` (L90), pre-onSetup abort (L91), `onSetup`===`false`
   (L97), post-onSetup abort (L100), per-element abort in `onEach` (L105), and the new post-onReady
   guard.
   **Done when:** `initFeature` returns the awaited `expose(ctx)` only when `feature.expose` is defined
   and the feature was not disabled/aborted/`onSetup`-false; `undefined` otherwise.

4. **Build inbound `deps`, conditionally store the outbound value in `runWithDeps`.** After the
   failed-dep check, build `const deps: Record<string, unknown> = {}; for (const d of validDeps) deps[d] = ctx.exposedValues.get(d);`
   Pass `deps` to `initFeature` and capture its returned value: `const exposed = await initFeature(descriptor, meta.selectors, deps, signal);`.
   Then store **only if this feature actually declares `expose` AND was not aborted** —
   `if (descriptor.expose && !signal?.aborted) ctx.exposedValues.set(meta.id, exposed);` — **before**
   `runWithDeps` resolves. `runWithDeps` itself still returns `Promise<void>`; `dispatchWaves` is
   unchanged (it discards the result and calls `markReady` in its `finally`).
   - The `descriptor.expose` guard keeps the map free of `undefined` entries for the ~all features
     that never expose (so `exposedValues.has(id)` stays meaningful; AC-2 still holds because
     `.get()` of an absent key is `undefined`).
   - The `!signal?.aborted` guard prevents a timed-out feature's background `runWithDeps` from
     writing a ghost value into the map after `markReady` already fired (see Risks).
   **Done when:** `deps` is built from `validDeps` only; the exposed value is stored before resolve
   (pre-`markReady`) and only for features that declare `expose` and were not aborted.

5. **Forward `expose` through the freeze in `define-feature.ts`.** Add `expose: descriptor.expose,`
   to the `Object.freeze({ … })` allowlist. Pass-through only — no validation (that is #37). Note:
   `defineFeature` still requires at least one of `onSetup`/`onEach` (L57-64), so any test of this
   pass-through MUST supply a valid lifecycle hook, not just `expose`.
   **Done when:** `defineFeature({ …, onSetup, expose: fn }).expose === fn` and is `undefined` when
   not provided.

6. **Add loader tests** (`loader.test.ts`) covering AC-1..AC-7 + edges, building descriptors
   directly with an `expose` override.
   **Done when:** new tests exist and `npm test` passes.

7. **Tighten the #35 define-feature test** (`define-feature.test.ts`): in the existing
   `'accepts expose returning a projection object (AC-1)'` test (and/or a new `it`), capture the
   `expose` fn and assert `defineFeature(minimal({ expose: exposeFn })).expose === exposeFn`, plus a
   case asserting `defineFeature(minimal()).expose` is `undefined`. (`minimal()` already supplies
   `onSetup: noop`, satisfying the lifecycle-hook requirement.) Replaces the vacuous #35
   `typeof result.id` assertion for the expose path.
   **Done when:** assertions verify real pass-through (present and absent) and pass.

8. **Build gate.**
   **Done when:** `npm run check-types`, `npm test`, and `npm run build` all pass.

## Interfaces

- **`ExecutionContext`** (changed): gains `exposedValues: Map<string, unknown>` — accumulates the
  exposed value of each feature **that declares `expose`**, keyed by feature id. Features without
  `expose` get no entry (so `.has(id)` is meaningful).
- **`initFeature`** (changed): `(feature: FeatureDescriptor, selectors: string[], deps: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>` — returns the **awaited** result of `expose(ctx)` (or `undefined`).
- **`runWithDeps`** (unchanged signature): stays `Promise<void>` — it captures `initFeature`'s
  return value and writes it into `ctx.exposedValues` itself; it does **not** return the value to
  `dispatchWaves`.

## Function Design

- `src/loader.ts`:
  - `initFeature` — owns one feature's lifecycle (onSetup→onEach→onReady→expose) and returns its
    exposed value. Stays single-feature-scoped; does not touch the shared map.
  - `runWithDeps` — owns dependency gating + the shared `exposedValues` map: builds the inbound
    `deps` record and stores the outbound exposed value. Orchestration boundary kept here, not in
    `initFeature`.
- No new top-level functions.

## Acceptance Criteria (EARS)

- **AC-1.** When a feature declares dependencies, the loader shall pass its `onSetup` a `deps`
  record containing only the exposed values of its directly-declared (validated) dependencies.
- **AC-2.** When a dependency defines no `expose`, that dependency's entry in dependents' `deps`
  shall be `undefined`.
- **AC-3.** If a feature's `onSetup` returns `false`, the loader shall not call that feature's
  `expose`, and dependents' `deps[id]` for it shall be `undefined`.
- **AC-4.** When a feature is in `failedIds`, the loader shall skip its dependents (existing
  behavior preserved).
- **AC-5.** If a feature's `expose` throws, the loader shall add that feature to `failedIds`.
- **AC-6.** When a feature defines `expose` but no `onSetup`, the loader shall call `expose(undefined)`.
- **AC-7.** The loader shall store a feature's exposed value before `markReady` fires for that
  feature, so dependents observe it when they start.
- **AC-8.** `defineFeature` shall forward a provided `expose` into the frozen descriptor (and leave
  it absent when not provided). [folded scope]
- **AC-9.** When a feature's `expose` returns a Promise, the loader shall await it and store the
  resolved value (not the Promise) so dependents receive the resolved value in `deps`. [red-team]
- **AC-10.** When multiple features declare the same dependency, each shall receive that
  dependency's same exposed value in its `deps[id]`. [red-team]
- **AC-11.** When a feature is disabled (`enabled === false`), the loader shall not call its
  `expose`, and dependents' `deps[id]` for it shall be `undefined`. [red-team]

## Out of Scope

- Runtime **validation** of `expose` (throwing if not a function) — that is **#37**.
- Integration tests exercising `defineFeature` → loader end-to-end — that is **#38**.
- Documentation of the "return functions over snapshots" convention — epic #34 / sibling.
- Cleanup/teardown lifecycle (`#21`) — unrelated.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Feature has `dependencies` but the dep defines no `expose` | [from issue] | `ctx.exposedValues.get(d)` returns `undefined` → `deps[id]` is `undefined` (AC-2). |
| 2 | Feature has `expose` but no `onSetup` | [from issue] | `ctx` stays `undefined`; `expose(undefined)` is called and its result stored (AC-6). |
| 3 | `global: true` feature with `expose` | [from issue] | No special-casing; it has `onSetup`/`onReady`, so `expose` runs normally. |
| 4 | `expose` returns `false` or `null` | [from epic] | Stored verbatim as the exposed value; NOT treated as an opt-out. |
| 5 | `expose` throws | [from issue] | Rejection propagates `initFeature`→`runWithDeps`→`dispatchWaves` catch → `failedIds` (AC-5); no value stored. |
| 6 | Timeout/abort fires after `onReady`, before `expose` | [inferred] | `signal?.aborted` guard before `expose` → return `undefined`, no `expose` call. |
| 7 | Transitive dependency (dep-of-dep) | [from epic] | `deps` built from direct `validDeps` only → transitive exposed values are not visible. |
| 8 | Same-wave dependent ordering | [inferred] | Storage happens inside `runWithDeps` before `markReady`; dependent's `waitForDependency` only resolves after the dep's `markReady`, so the value is present (AC-7). |
| 9 | `enabled: false` feature with `expose` | [red-team] | `initFeature` returns at L90 before any lifecycle; `expose` not called; no entry in `exposedValues`; dependents' `deps[id]` is `undefined` (AC-11). |
| 10 | `expose` is async (returns a Promise) | [red-team] | Awaited in `initFeature`; the resolved value is stored, not the Promise (AC-9). |
| 11 | Dependency pruned as a circular edge | [red-team] | Pruned edge is absent from `validDeps`, so the key is **absent** from the `deps` object (not `undefined`-valued); `deps[id]` access still yields `undefined`. Contract: rely on value access, not `'id' in deps`. |
| 12 | Fan-out: many dependents of one exposing feature | [red-team] | Single store in the producer's `runWithDeps`; the shared `exposedValues` map serves all dependents the same value (AC-10). |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| `deps` record passed to `onSetup` | AC-1, AC-2, AC-7, AC-10 |
| `expose` called + accumulated | AC-3, AC-6, AC-9, AC-11, edge 4 |
| Failure semantics | AC-4, AC-5 |
| `defineFeature` pass-through | AC-8 |
| Build integrity | `npm run check-types` + `npm test` + `npm run build` all pass |

## Risks

- **Stacked branch:** #36 builds on the unmerged `feat/35`. If #35's PR (#40) changes during
  review, #36 may need a rebase. → Mitigate: keep #36's PR targeting `feat/35` (or `feat/34` after
  #35 merges); the diff stays small.
- **`initFeature` signature change** → single caller (`runWithDeps:276`); guarded by `check-types`.
- **Store-before-`markReady` ordering** is the crux of AC-7 → enforced by storing inside
  `runWithDeps` before it resolves (markReady is in the later `finally`). A test asserts a dependent
  reads the dep's exposed value at its own `onSetup`.
- **Folded freeze pass-through without validation:** a non-function `expose` would be stored as-is
  and later called → throws at runtime. Acceptable for #36 (validation is #37); not a regression
  since `expose` did not exist before.
- **[red-team] Async `expose` not awaited would be a silent bug:** the type permits `Promise`
  returns; storing the unawaited value gives dependents a Promise. → Mitigated by `await` in Step 3
  (AC-9) and a dedicated test.
- **[red-team] Timeout ghost-write:** `withTimeout` wins the race but the background `runWithDeps`
  keeps running and could `set()` after `markReady`. → Mitigated by the `!signal?.aborted` guard
  before the store (Step 4). The feature is already in `failedIds`, so dependents skip regardless.
- **[red-team] `define-feature.ts` conflict with #37:** #36 adds `expose` to the same `Object.freeze`
  block that #37 will add validation to. → #37 must stack on `feat/36` (or rebase onto it after
  merge); the conflict is at one known block.

## Test Strategy

- All loader tests in `src/__tests__/loader.test.ts`, building `FeatureDescriptor` directly via
  `makeLoadable(id, { expose, onSetup, dependencies, ... })` — mirrors the existing helper style; no
  `defineFeature` round-trip (that is #38).
- Cases:
  - Dependent's `onSetup` receives `deps` containing only its direct deps' exposed values (AC-1),
    and transitive deps are absent (edge 7).
  - Dependency without `expose` → `deps[id] === undefined` (AC-2).
  - `onSetup` returns `false` → `expose` not called, dependents' `deps[id] === undefined` (AC-3).
  - Failed dependency (in `failedIds`) → dependents skipped, `onSetup` not called (AC-4).
  - `expose` throws → feature in `failedIds`, dependents skipped (AC-5).
  - `expose` with no `onSetup` → `expose` called with `undefined` (AC-6).
  - **AC-7 ordering (must be non-vacuous):** in the dependent's `onSetup`, capture `deps['a']` into
    an outer variable *inside the callback*; after `loadFeatures` resolves, assert that captured
    value. Asserting `exposedValues.get('a')` post-run does NOT test ordering and is vacuous.
  - `expose` returns `false`/`null` → stored and delivered verbatim (edge 4).
  - **Async `expose`** (`expose: async () => 'v'`) → dependent's `deps[id] === 'v'`, not a Promise (AC-9).
  - **Fan-out** → producer A exposes `{v:1}`; B and C both depend on A; both receive `deps['a'] = {v:1}` (AC-10).
  - **`enabled: false`** producer with `expose` → dependent's `deps[id]` is `undefined`; producer's `expose` not called (AC-11).
  - **No `expose`** → after load, `ctx.exposedValues.has(id)` is `false` (store is conditional); dependents' `deps[id]` is `undefined` (AC-2).
  - **Pruned circular dep** → for A↔B (one edge pruned), the dependent's `deps` has no key for the pruned dep (edge 11).
- `src/__tests__/define-feature.test.ts`: assert `defineFeature({ expose: fn }).expose === fn` and
  absent otherwise (AC-8) — replaces the #35 vacuous runtime assertion.
- Gate: `npm run check-types` (now `-p tsconfig.eslint.json`, includes tests) + `npm test`
  (vitest/jsdom) + `npm run build`.
