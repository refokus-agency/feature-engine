---
issue_number: 23
issue_title: "Parallel feature initialization in loadFeatures"
repo: "refokus-agency/feature-engine"
labels: []
plan_level: "lean"
depth: "medium"
branch_name: "feat/23-parallel-feature-initialization"
created_at: "2026-05-22T20:50:00Z"
updated_at: "2026-05-25T19:45:00Z"
---

# Implementation Plan: #23 — Parallel feature initialization in loadFeatures

## Files

| # | Action | File | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/loader.ts` | ~~Fix resolver clobber bug, add wave grouping, concurrent dispatch, pruned-edge cycle resolution, AbortController cancellation~~ ✅ + Refactor: extract ExecutionContext, pre-compute valid deps, extract loadChunks, separate match from sort |
| 2 | modify | `src/__tests__/loader.test.ts` | ~~Update ordering/circular tests, add 15 new tests for waves, abort, cycles, and edge cases~~ ✅ + DRY: consolidate warn spy into beforeEach, fix makeLoadable selector duplication |
| 3 | added | `docs/specs/issue-23-parallel-feature-initialization-in-loadfeatures.md` | Plan artifact [discovered during implementation] |

## Codebase Context

- **`matchFeatures` (L28-53):** Filters `FeatureMeta[]` against DOM selectors, appends globals unconditionally, sorts by priority ascending. ⚠️ Finding 5: sort belongs closer to consumer, not inside the matching function.
- **`topoSort` (L113-145):** DFS topological sort with cycle detection. Returns `TopoSortResult { sorted: FeatureMeta[]; prunedEdges: Set<string> }`. Pruned edges are back-edges removed to break cycles — communicated downstream so `runWithDeps` skips them (prevents cross-wave deadlock).
- **`initFeature` (L77-106):** Per-feature lifecycle runner (onSetup → onEach → onReady). Accepts optional `AbortSignal` — checks `signal.aborted` before onSetup, before/during onEach loop, and before onReady to cancel ghost execution after timeout.
- **`withTimeout` (L55-75):** Races a promise against setTimeout. Simplified to take resolved `ms: number` (caller resolves null → default). Accepts optional `AbortController` — calls `controller.abort()` on timeout.
- **`createDependencyGate` (L185-221):** Pub/sub mechanism encapsulated in `DependencyGate` interface. Uses `Map<string, Set<() => void>>` (fixes resolver clobber bug).
- **`runWithDeps` (L223-265):** Validates deps (self-dep, unknown, pruned circular), waits via gate, calls initFeature. ⚠️ Finding 3: dep validation is static and pre-computable. ⚠️ Finding 1: takes 8 params.
- **`dispatchWaves` (L267-309):** Iterates waves sequentially, `Promise.allSettled` within each. Creates `AbortController` per feature. ⚠️ Finding 1: takes 8 params.
- **`loadFeatures` (L311-357):** Orchestrator with 6 sequential responsibilities. ⚠️ Finding 4: load-result processing should be extracted.
- **Code style:** camelCase functions, PascalCase types, SCREAMING_SNAKE constants. Named type imports with `.ts` extension (ESM). async/await throughout. `warn + continue` error pattern.
- **Package version:** `0.0.0-development` (pre-1.0, managed by semantic-release). Breaking changes acceptable with changelog.

## Steps

### ~~Step 1: Add `groupIntoWaves()` function~~ ✅
### ~~Step 2: Fix resolver clobber bug~~ ✅
### ~~Step 3: Replace sequential for-loop with wave-based dispatch~~ ✅
### ~~Step 4: Update test "resolves features with equal priority in stable input order"~~ ✅
### ~~Step 5: Add test — same-priority features run concurrently~~ ✅
### ~~Step 6: Add test — multiple features depend on same feature (resolver fix)~~ ✅
### ~~Step 7: Add test — cross-wave dependency promotion~~ ✅
### ~~Step 8: Add test — diamond dependency across waves~~ ✅
### ~~Step 9: Add test — cross-priority ordering preserved~~ ✅
### ~~Step 10: Run full test suite~~ ✅ (139 tests passing)

### Step 11: Extract `ExecutionContext` interface [NEW — Refactor]

Extract shared mutable state passed through `dispatchWaves` and `runWithDeps` into a single value object.

```typescript
interface ExecutionContext {
  knownIds: Set<string>;
  gate: DependencyGate;
  prunedEdges: Set<string>;
  failedIds: Set<string>;
  warn: LogFn;
}
```

**Changes:**
1. Define `ExecutionContext` interface near the other interfaces at the top of the file
2. Refactor `dispatchWaves` signature: `(waves, descriptorById, ctx, globalTimeout)` — 4 params instead of 8
3. Refactor `runWithDeps` signature: `(meta, descriptor, ctx, signal?)` — 4 params instead of 8
4. Update `loadFeatures` to construct the context object and pass it through
5. Internal reads use `ctx.knownIds`, `ctx.gate.markReady(id)`, etc.

**Done when:** `dispatchWaves` has ≤5 params, `runWithDeps` has ≤5 params. All 139 tests pass. Zero behavior change.

### Step 12: Pre-compute valid dependencies [NEW — Refactor]

Move the dep validation logic out of `runWithDeps` into a pre-processing step.

**Current state (lines 234-249):** `runWithDeps` filters deps on every invocation — self-dep check, unknown-dep check, pruned-edge check. All three conditions are static (known before dispatch starts).

**Changes:**
1. Add `validDeps: string[]` to `LoadedFeature` interface
2. Add a `buildValidDeps` function that takes `(meta, knownIds, prunedEdges, warn)` and returns the filtered, deduplicated array — emitting warnings for self-dep and unknown-dep during pre-computation
3. Call `buildValidDeps` for each loaded feature in `loadFeatures` after topoSort, before dispatch
4. Simplify `runWithDeps` to only: (a) wait for `validDeps`, (b) check `failedIds`, (c) call `initFeature`

**Done when:** `runWithDeps` contains no dep filtering logic. All dep warnings are emitted during pre-computation. All 139 tests pass.

### Step 13: Extract `loadChunks` function [NEW — Refactor]

Extract the `Promise.allSettled` + result-processing loop from `loadFeatures` into a dedicated function.

```typescript
interface LoadResult {
  loaded: LoadedFeature[];
  failedIds: Set<string>;
}

async function loadChunks(
  sortedFeatures: FeatureMeta[],
  gate: DependencyGate,
  warn: LogFn,
): Promise<LoadResult>
```

**Changes:**
1. Move lines 327-347 from `loadFeatures` into `loadChunks`
2. `loadChunks` calls `Promise.allSettled(sortedFeatures.map(f => f.load()))`, processes results, calls `gate.markReady` for failures, returns `{ loaded, failedIds }`
3. `loadFeatures` becomes a thin coordinator: match → sort → createGate → loadChunks → groupWaves → dispatch

**Done when:** `loadFeatures` is ≤25 lines of orchestration calls. All 139 tests pass.

### Step 14: Separate matching from sorting [NEW — Refactor]

`matchFeatures` currently both filters by selector/global AND sorts by priority. These are two distinct concerns.

**Changes:**
1. Remove `.sort((a, b) => a.priority - b.priority)` from `matchFeatures`
2. Add explicit sort in `loadFeatures` between `matchFeatures` and `topoSort`: `matched.sort((a, b) => a.priority - b.priority)`

**Done when:** `matchFeatures` is a pure filter. Sort is explicit in the orchestrator. All tests pass.

### Step 15: DRY test helpers [NEW — Refactor]

**15a. Consolidate `vi.spyOn(console, 'warn')` into `beforeEach` per describe block:**
- `dependency ordering` block: all 4 tests need it → move to block-level `beforeEach`
- `chunk load failure` block: all 5 tests need it → move to block-level `beforeEach`
- `wave-based concurrent dispatch` block: 12 of 14 tests need it → move to block-level `beforeEach`
- Tests that assert on `warnSpy` still call `vi.spyOn` to get the mock instance reference

**15b. Fix selector duplication in `makeLoadable`:**
- Update `makeLoadable` to derive `meta.selectors` from `descriptor.selectors` when not explicitly overridden in the meta argument
- Removes ~10 duplicated selector arrays across the test file

**Done when:** No bare `vi.spyOn(console, 'warn').mockImplementation(noop)` lines exist in individual tests where the block-level `beforeEach` already provides it. Selector strings appear once per test call. All tests pass.

### Step 16: Run full test suite [NEW] ✅ (142 tests passing)

### Step 17: Fix runtime failure cascade in dispatchWaves [NEW — Review Fix]

Add `ctx.failedIds.add(feature.meta.id)` in `dispatchWaves` catch block so runtime failures (onSetup/onEach/onReady throwing) cascade to dependents — matching chunk-load failure behavior.

**Done when:** Runtime throw in onSetup causes dependents to be skipped. Test added and passing. ✅

### Step 18: Fix deadlock warning false positive [NEW — Review Fix]

Change `feature.meta.dependencies.length` to `feature.validDeps.length` in `dispatchWaves` deadlock risk warning. Prevents spurious warning when all deps are pruned/self/unknown.

**Done when:** Warning only fires when there are actual valid deps with timeout ≤ 0. ✅

### Step 19: Add NaN guard to resolveTimeout [NEW — Review Fix]

Add `Number.isNaN(timeout)` check alongside the existing `< 0` guard. Falls back to default with warning.

**Done when:** `resolveTimeout(NaN, warn)` returns `DEFAULT_TIMEOUT_MS` and emits warning. ✅

### Step 20: Add missing test coverage from review [NEW — Review Fix]

- Test: runtime throw cascading to dependent (P1-2)
- Test: runtime throw cascading through dependency chain
- Test: timeout fires mid-`onEach` loop — remaining iterations and `onReady` skipped (AC-8 gap)

**Done when:** 3 new tests pass. Total: 142 tests. ✅

### Step 21: Run full test suite after review fixes [NEW]

**Done when:** `vitest` passes all 142 tests. Zero regressions. ✅

## Interfaces

```typescript
// Existing (no changes)
interface LoadedFeature {
  meta: FeatureMeta;
  descriptor: FeatureDescriptor;
  validDeps: string[];           // NEW — pre-computed valid dependency IDs
}

interface DependencyGate {
  markReady: (id: string) => void;
  waitForDependency: (id: string) => Promise<void>;
}

interface TopoSortResult {
  sorted: FeatureMeta[];
  prunedEdges: Set<string>;
}

// NEW
interface ExecutionContext {
  knownIds: Set<string>;
  gate: DependencyGate;
  prunedEdges: Set<string>;
  failedIds: Set<string>;
  warn: LogFn;
}

interface LoadResult {
  loaded: LoadedFeature[];
  failedIds: Set<string>;
}

// Function signatures after refactor
function resolveTimeout(raw: number | undefined, warn: LogFn): number
function matchFeatures(features: FeatureMeta[], warn: LogFn): FeatureMeta[]  // no longer sorts
function withTimeout<T>(promise: Promise<T>, ms: number, id: string, controller?: AbortController): Promise<T>
function initFeature(feature: FeatureDescriptor, selectors: string[], signal?: AbortSignal): Promise<void>
function topoSort(matched: FeatureMeta[], warn: LogFn): TopoSortResult
function groupIntoWaves(sorted: FeatureMeta[], warn: LogFn): Map<number, FeatureMeta[]>
function createDependencyGate(allFeatures: FeatureMeta[], matchedIds: Set<string>): DependencyGate
function buildValidDeps(meta: FeatureMeta, knownIds: Set<string>, prunedEdges: Set<string>, warn: LogFn): string[]  // NEW
function loadChunks(sortedFeatures: FeatureMeta[], knownIds: Set<string>, prunedEdges: Set<string>, gate: DependencyGate, warn: LogFn): Promise<LoadResult>  // NEW — 5 params (bakes buildValidDeps inside to avoid second loop; deliberate deviation from 3-param plan)
function runWithDeps(meta: FeatureMeta, descriptor: FeatureDescriptor, validDeps: string[], ctx: ExecutionContext, signal?: AbortSignal): Promise<void>  // REFACTORED — 5 params
function dispatchWaves(waves: Map<number, FeatureMeta[]>, descriptorById: Map<string, FeatureDescriptor>, ctx: ExecutionContext, globalTimeout: number): Promise<void>  // REFACTORED — 4 params
```

Existing public types (`FeatureMeta`, `FeatureDescriptor`, `LoaderOptions`) remain unchanged.

## Function Design

### `src/loader.ts`

| Function | Concern | Status |
|----------|---------|--------|
| `resolveTimeout` | Validate timeout input | ✅ Done |
| `matchFeatures` | Filter by DOM | ✅ Done — Step 14 removes sort |
| `withTimeout` | Race promise vs setTimeout + abort | ✅ Done |
| `initFeature` | Per-feature lifecycle (onSetup→onEach→onReady) | ✅ Done |
| `topoSort` | DFS topo-sort + cycle detection | ✅ Done |
| `groupIntoWaves` | Group features by effective wave | ✅ Done |
| `createDependencyGate` | Pub/sub gate (readySet + depResolvers) | ✅ Done |
| `buildValidDeps` | Pre-compute filtered dep list per feature | **New — Step 12** |
| `loadChunks` | Parallel chunk loading + result processing | **New — Step 13** |
| `runWithDeps` | Wait for deps + init | ✅ Done — Step 11+12 simplifies to 5 params |
| `dispatchWaves` | Wave iteration + concurrent dispatch | ✅ Done — Step 11 simplifies to 4 params |
| `loadFeatures` | Thin orchestrator | ✅ Done — Step 13 reduces to ~25 lines |

### `groupIntoWaves` detail

**Precondition:** Input must be in topoSort order (dependencies appear before dependents). This guarantees single-pass correctness.

Maintain `effectiveWave: Map<string, number>` keyed by feature ID. Single-pass over input:
1. Start with `wave = feature.priority`
2. For each dep in `feature.dependencies`: look up `effectiveWave.get(depId)`. If dep is NOT in the map (unmatched/failed-load feature, already pre-seeded as ready), **skip** — it does not trigger promotion. If found and `> wave`, update `wave` to that value.
3. Store `effectiveWave.set(feature.id, wave)`
4. If `wave !== feature.priority`, emit warning: `[loader] Feature "${id}" promoted from priority ${feature.priority} to wave ${wave} — depends on "${depId}" in later wave`
5. Group into `Map<number, FeatureMeta[]>` keyed by effective wave

### `buildValidDeps` detail (NEW)

Pre-computes the valid dependency list for a single feature. Runs once per loaded feature, not at dispatch time.

1. Deduplicate: `[...new Set(meta.dependencies)]`
2. Filter out self-deps: `depId === meta.id` → warn + skip
3. Filter out unknown deps: `!knownIds.has(depId)` → warn + skip
4. Filter out pruned edges: `prunedEdges.has(\`${meta.id}->${depId}\`)` → skip (already warned by topoSort)
5. Return filtered array

### `loadChunks` detail (NEW)

Encapsulates the load + classify + dep-validation logic:

1. `Promise.allSettled(sortedFeatures.map(f => f.load()))`
2. For each result: if rejected → warn, add to `failedIds`, call `gate.markReady`; if fulfilled → push to `loaded[]` with `validDeps` computed via `buildValidDeps`
3. Return `{ loaded, failedIds }`

**Note:** The plan originally specified 3 params `(sortedFeatures, gate, warn)` with `buildValidDeps` called separately in `loadFeatures`. The implementation uses 5 params `(sortedFeatures, knownIds, prunedEdges, gate, warn)` to bake `buildValidDeps` inside, avoiding a second loop. This is a deliberate deviation — accepted during review.

## Acceptance Criteria (EARS)

- **AC-1.** When features share the same priority value and have no mutual dependencies, the system shall initialize them concurrently within a single wave. ✅
- **AC-2.** When features have different priority values, the system shall execute lower-priority-value waves before higher-priority-value waves sequentially. ✅
- **AC-3.** When a feature declares dependencies, it shall wait for those specific dependencies to complete before its own initialization, regardless of wave placement. ✅
- **AC-4.** When multiple features depend on the same feature, all dependents shall be unblocked when that dependency completes. ✅
- **AC-5.** When a feature's declared dependency has a higher priority value (later wave), the system shall promote the feature to that wave and emit a warning matching the pattern: `[loader] Feature "${id}" promoted from priority N to wave M — depends on "${depId}" in later wave`. ✅
- **AC-6.** If a feature in a wave times out or fails, it shall not prevent other features in the same wave or subsequent waves from initializing. `markReady` shall fire in a `finally` block guaranteeing dependents unblock. ✅
- **AC-7.** When circular dependencies exist, the back-edge shall be pruned by `topoSort` and skipped by `runWithDeps`. Both features shall complete normally without timeout. A circular dependency warning shall be emitted. ✅
- **AC-8.** When a feature times out, its lifecycle shall be cancelled via `AbortSignal`. `onSetup` (if not yet started), `onEach`, and `onReady` shall not execute after abort. ✅
- **AC-9.** When a feature's dependency fails to load (chunk rejected), the system shall skip the dependent feature, emit a warning `Feature "${id}" skipped — dependency "${depId}" failed`, and propagate the failure to any feature depending on the skipped feature. ✅
- **AC-10.** All existing tests (except modified ordering/circular tests) shall pass without changes. ✅
- **AC-11.** [NEW] After refactoring, no function in `loader.ts` shall have more than 5 parameters. Behavior unchanged — all 139+ tests pass.
- **AC-12.** [NEW] Dependency validation (self-dep, unknown-dep, pruned-edge) shall run once per feature during pre-computation, not at dispatch time.

## Out of Scope

- Changes to public API types (`FeatureDescriptorInput`, `FeatureMeta`, `LoaderOptions`)
- Concurrency mode toggle option (e.g., `sequential` vs `parallel`)
- Consumer migration guide or documentation updates
- Changes to the vite plugin (`src/vite/`)

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | A(p=1) depends on B(p=25) | [from issue] | Promote A to wave 25. Emit warning. A and B run in same wave, A waits for B via `waitForDependency`. |
| 2 | All features same priority, no deps | [from issue] | Single wave, all run concurrently via `Promise.allSettled`. Maximum parallelism. |
| 3 | Circular deps A↔B | [from issue] | `topoSort` detects cycle and prunes the back-edge (e.g., B→A). `prunedEdges` set contains `"B->A"`. `runWithDeps` for B skips the pruned dep on A. Both features complete normally — no timeout needed. Circular dependency warning emitted by `topoSort`. |
| 4 | Diamond: D(p=1)→{B,C}(p=5)→A(p=10) | [from issue] | Wave 1: D runs. Wave 5: B,C run concurrently (D already ready via `readySet`). Wave 10: A runs (B,C ready). |
| 5 | F1,F2,F3 (same priority) depend on A (same priority) | [from issue] | All in same wave. Three resolvers registered in Set for A. `markReady('A')` iterates Set, resolves all three. Without the Set fix, only the last would resolve. |
| 6 | Dep on unmatched feature | [from issue] | Unmatched features pre-seeded as ready in `readySet` (existing L143-147). `waitForDependency` resolves immediately. No change needed. |
| 7 | Dep on failed chunk load | [from issue] | Chunk rejected → `failedIds.add(id)` + `markReady` called. Dependents unblock but `runWithDeps` checks `failedIds` before `initFeature` — skips with warning `Feature "X" skipped — dependency "Y" failed`. Failure cascades: skipped feature is also added to `failedIds`. |
| 7b | Cascading dep failure (A→B→C, A fails) | [discovered during implementation] | A's chunk fails → B skipped (dep A failed) → C skipped (dep B failed). Each emits a "skipped" warning. Non-dependents in the same wave run normally. |
| 8 | Worst-in-wave stall (1 slow, 9 fast) | [from issue] | Next wave blocked until slowest feature settles. Bounded by per-feature `timeout`. Consumers can set tight timeouts on known-slow features. |
| 9 | Timeout covers dep-wait in parallel | [from issue] | `withTimeout` wraps entire `run()` (dep-wait + lifecycle). In sequential mode, deps completed before timeout started. In wave mode, within-wave dep-wait consumes real timeout budget. Semantic change — document in changelog. |
| 10 | `enabled: false` on descriptor | [inferred] | `initFeature` returns early (L82). Feature's async task completes normally. `markReady` fires. Dependents unblock. |
| 11 | `onSetup` returns `false` (abort) | [inferred] | `initFeature` skips onEach/onReady, returns normally (L88). `markReady` fires. Dependents unblock. |
| 12 | Cascading promotion: A(p=1,deps=[B]), B(p=5,deps=[C]), C(p=10) | [inferred] | Single-pass in topoSort order: C processed first → wave 10. B next → `max(5, 10)` = wave 10. A last → `max(1, 10)` = wave 10. All three land in wave 10. Two promotion warnings emitted. |
| 13 | Intra-wave dep: A and B same priority, B deps on A | [inferred] | Both in same wave. Both launch concurrently. B calls `waitForDependency('A')`. A runs lifecycle, calls `markReady`. B unblocks. Wave completes when both settle. |
| 14 | Empty features array / no DOM matches | [inferred] | Returns early at existing L322-323. No change needed. |
| 15 | [NEW] `buildValidDeps` emits self-dep warning once | [discovered during review] | Pre-computation ensures warning fires during setup, not during dispatch. No duplicate warnings if feature appears in multiple waves (it can't — features belong to exactly one wave). |
| 16 | [NEW] Runtime failure (onSetup/onEach/onReady throws) cascades to dependents | [discovered during code-attacker review] | `dispatchWaves` catch block adds to `failedIds` before logging. Dependents check `failedIds` after gate unblocks and skip if failed. Cascades through chain just like chunk-load failure. |
| 17 | [NEW] Timeout fires mid-`onEach` loop — remaining iterations and `onReady` skipped | [discovered during code-reviewer review] | `initFeature` checks `signal?.aborted` before each `onEach` call (L103). AbortController.abort() fires on timeout, all subsequent lifecycle steps are skipped. |
| 18 | [NEW] NaN timeout value | [discovered during code-attacker review] | `resolveTimeout` guards against `NaN` via `Number.isNaN(timeout)` — falls back to default with warning. Prevents instant timeout (setTimeout with NaN delay fires at 0ms). |

## Done Criteria per Feature

| Feature | Done when ACs pass |
|---------|-------------------|
| ~~Resolver Set fix~~ ✅ | AC-4, AC-6 |
| ~~Wave grouping (`groupIntoWaves`)~~ ✅ | AC-1, AC-2, AC-5 |
| ~~Concurrent dispatch (wave loop)~~ ✅ | AC-1, AC-3, AC-6 |
| ~~Cross-wave dependency promotion~~ ✅ | AC-5 |
| ~~Pruned-edge cycle resolution~~ ✅ | AC-7 |
| ~~AbortController cancellation~~ ✅ | AC-8 |
| ~~Dependency failure propagation~~ ✅ | AC-9 |
| ~~Test updates~~ ✅ | AC-10 |
| ExecutionContext extraction (Step 11) | AC-11 |
| Pre-compute valid deps (Step 12) | AC-11, AC-12 |
| Extract loadChunks (Step 13) | AC-11 |
| Separate match from sort (Step 14) | AC-11 |
| DRY test helpers (Step 15) | AC-11 |

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Features at the same priority that relied on implicit sequential ordering now run concurrently — potential breakage for consumers with shared mutable state between same-priority features | Changelog note. Package is pre-1.0 (`0.0.0-development`). The correct mechanism for ordering is `dependencies`, not priority within a group. |
| 2 | Timeout semantic change: timeout now includes dep-wait time for within-wave dependencies (previously, in sequential mode, deps completed before the feature's timeout started) | Document in changelog. Bounded by existing timeout configuration. Consumers can increase timeout or set `timeout: 0` to disable. |
| 3 | Test flakiness from timing-dependent assertions in concurrency tests | Prefer call-order tracking (push to array inside onSetup mock, assert ordering after await) over `Date.now()` deltas. For concurrency proof, set a flag during slow feature's onSetup to verify fast already ran. |
| 4 | Wave-level stall: a slow or hung feature blocks all subsequent waves until its timeout fires | Consumers must set per-feature timeouts on features that may hang. Document this requirement in changelog. Consider per-wave timeout as future option. |
| 5 | Synchronous throw in per-feature wave closure escapes `Promise.allSettled` if not declared `async` | Each wave feature closure MUST be an `async` arrow function so any synchronous throw becomes a rejected promise captured by `allSettled`. |
| 6 | [NEW] Refactoring introduces subtle behavior change in warning emission order | Pre-computing `buildValidDeps` moves self-dep/unknown-dep warnings from dispatch-time to pre-computation. This changes the interleaving of warnings relative to "Feature X failed" or "Feature X promoted" messages. Since warnings are for debugging only (not part of the public API), this is acceptable. Mitigated by running the full test suite after each refactoring step. |

## Test Strategy

- **Modified 4 existing tests:**
  - `resolves features with equal priority` → relaxed to `toContain` (order non-deterministic with concurrency)
  - `handles circular dependencies without throwing` → asserts both onSetup called (no timeout needed with pruned edges)
  - `initializes dependencies before dependents` → suppressed promotion warnings
  - `resolves a deep 3-level dependency chain` → suppressed promotion warnings
- **Added 15 new tests in `wave-based concurrent dispatch` describe:**
  - Same-priority concurrent execution (barrier pattern, no setTimeout)
  - Resolver Set fix — same-wave fan-out (F1,F2,F3 depend on A, ordering asserted)
  - Resolver Set fix — cross-wave (A at p=1, F1,F2,F3 at p=5)
  - Cross-wave dependency promotion with warning
  - Diamond dependency across waves
  - Sequential wave execution with numeric sort (p=2 before p=10)
  - Circular pair completes without timeout (pruned edges)
  - Unblocks dependent when `enabled: false`
  - Unblocks dependent when `onSetup` returns false
  - Self-dependency warning + completion
  - Cascading promotion across 3 levels
  - 3-node cycle completes without relying on timeout
  - Does not run onReady after timeout during onSetup (AbortController)
  - Does not run onSetup after timeout during dep wait (AbortController)
  - Pruned circular dep does not affect non-circular deps
- **Modified 1 existing test in `chunk load failure` describe:**
  - `unblocks dependent features when a chunk fails to load` → renamed to `skips dependent feature when a chunk fails to load`, asserts onSetup NOT called + "skipped" warning emitted
- **Added 4 new tests in `chunk load failure` describe:**
  - Cascades failure through dependency chain (A fails → B,C skipped)
  - Failure does not spread to non-dependents
  - Skips feature when any dependency in the list failed
  - (existing) Warns and continues when a chunk fails to load
- **Added 3 new tests from review findings:**
  - Runtime throw cascading to dependent (chunk load failure block)
  - Runtime throw cascading through dependency chain (chunk load failure block)
  - Timeout fires mid-`onEach` loop — remaining iterations and `onReady` skipped (wave-based block)
- **50 total loader tests**, 142 total across all test files — all passing
- **Concurrency verification:** Barrier pattern (Promise-based coordination) instead of setTimeout timing
- **[NEW] Refactoring verification:** Each step (11-15) must preserve all 139+ tests. Run `vitest` after each step.
- **[NEW] Review fix verification:** Steps 17-21 added 3 tests and fixed 3 bugs. All 142 tests pass.
