---
issue_number: 23
issue_title: "Parallel feature initialization in loadFeatures"
repo: "refokus-agency/feature-engine"
labels: []
plan_level: "lean"
depth: "medium"
branch_name: "feat/23-parallel-feature-initialization"
created_at: "2026-05-22T20:50:00Z"
updated_at: "2026-05-22T22:17:00Z"
---

# Implementation Plan: #23 — Parallel feature initialization in loadFeatures

## Files

| # | Action | File | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/loader.ts` | Fix resolver clobber bug, add wave grouping, concurrent dispatch, pruned-edge cycle resolution, AbortController cancellation |
| 2 | modify | `src/__tests__/loader.test.ts` | Update ordering/circular tests, add 15 new tests for waves, abort, cycles, and edge cases |

## Codebase Context

- **`matchFeatures` (L7-32):** Filters `FeatureMeta[]` against DOM selectors, appends globals unconditionally, sorts by priority ascending. Keep as-is — output feeds into `topoSort`, then wave grouping.
- **`topoSort` (L112-144):** DFS topological sort with cycle detection. Returns `TopoSortResult { sorted: FeatureMeta[]; prunedEdges: Set<string> }`. Pruned edges are back-edges removed to break cycles — communicated downstream so `runWithDeps` skips them (prevents cross-wave deadlock).
- **`initFeature` (L77-106):** Per-feature lifecycle runner (onSetup → onEach → onReady). Accepts optional `AbortSignal` — checks `signal.aborted` before onSetup, before/during onEach loop, and before onReady to cancel ghost execution after timeout.
- **`withTimeout` (L55-75):** Races a promise against setTimeout. Simplified to take resolved `ms: number` (caller resolves null → default). Accepts optional `AbortController` — calls `controller.abort()` on timeout.
- **`createDependencyGate` (L184-220):** Pub/sub mechanism encapsulated in `DependencyGate` interface. Uses `Map<string, Set<() => void>>` (fixes resolver clobber bug).
- **`runWithDeps` (L222-254):** Validates deps (self-dep, unknown, pruned circular), waits via gate, calls initFeature. Threads `prunedEdges` and `AbortSignal`.
- **`dispatchWaves` (L256-297):** Iterates waves sequentially, `Promise.allSettled` within each. Creates `AbortController` per feature.
- **Code style:** camelCase functions, PascalCase types, SCREAMING_SNAKE constants. Named type imports with `.ts` extension (ESM). async/await throughout. `warn + continue` error pattern.
- **Package version:** `0.0.0-development` (pre-1.0, managed by semantic-release). Breaking changes acceptable with changelog.

## Steps

### Step 1: Add `groupIntoWaves()` function
Add a new function after `topoSort` that groups features by effective wave (priority value + cross-wave dependency promotion).

**Precondition:** Input MUST be in topoSort order (dependencies appear before dependents). This invariant guarantees single-pass correctness — by the time a feature is processed, all its dependencies' effective waves are already computed.

**Algorithm:** Single-pass in topoSort order. Maintain `effectiveWave: Map<string, number>` keyed by feature ID. For each feature:
1. Start with `wave = feature.priority`
2. For each dep in `feature.dependencies`: look up `effectiveWave.get(depId)`. If the dep is NOT in the map (unmatched feature, pre-seeded as ready), skip it — it does not affect wave promotion. If found and `> wave`, update `wave`.
3. Store `effectiveWave.set(feature.id, wave)`
4. If `wave !== feature.priority`, emit warning: `[loader] Feature "${id}" promoted from priority ${feature.priority} to wave ${wave} — depends on "${depId}" in later wave`

**Done when:** Function takes sorted `FeatureMeta[]`, returns `Map<number, FeatureMeta[]>` with features grouped by effective wave. Cross-wave deps cause promotion with warning. Deps not in the map (unmatched/failed-load) are skipped without promotion.

### Step 2: Fix resolver clobber bug
Change `resolvers` from `Map<string, () => void>` to `Map<string, Set<() => void>>`.

Update `waitForDependency`: create Set if not exists, add resolve callback to Set.
Update `markReady`: iterate Set with `forEach`, call each resolver, then delete the entry.

**Done when:** `waitForDependency` adds to a Set; `markReady` resolves all callbacks in the Set. Multiple features depending on the same feature all unblock correctly.

### Step 3: Replace sequential for-loop with wave-based dispatch
Replace lines 163-207 with:

1. **Pre-process:** Iterate `sorted` and `results` in parallel. For each `results[i]`:
   - If `result.status === 'rejected'`: warn, call `markReady(id)`, **exclude from further processing**.
   - If `result.status === 'fulfilled'`: add to a filtered array of type `Array<{ meta: FeatureMeta; descriptor: FeatureDescriptor }>`.
   - **Only fulfilled features** are passed to `groupIntoWaves`.

2. **Group:** Call `groupIntoWaves(filtered.map(f => f.meta), warn)` to get wave groups. Then re-associate each `FeatureMeta` with its loaded `FeatureDescriptor` for dispatch.

3. **Wave keys:** Get sorted wave keys: `[...waves.keys()].sort((a, b) => a - b)` — MUST use numeric comparator, not default lexicographic sort.

4. **Dispatch:** For each wave in order:
```typescript
await Promise.allSettled(waveFeatures.map(async (f) => {
  try {
    const run = async (): Promise<void> => {
      // validate + waitForDependency for declared deps
      await initFeature(f.descriptor, f.meta.selectors);
    };
    await withTimeout(run(), f.meta.timeout, f.meta.id, globalTimeout);
  } catch (err) {
    warn(`[loader] Feature "${f.meta.id}" failed:`, err);
  } finally {
    markReady(f.meta.id);  // MUST be in finally — fires on success, failure, AND timeout
  }
}));
```

**Critical: `markReady` in `finally`** — This guarantees markReady fires whether the feature succeeds, throws, or times out. Without `finally`, a timed-out feature's markReady never fires, permanently blocking any dependents waiting on it. This preserves the existing semantic where markReady was called unconditionally after the catch block (L206).

**Critical: async arrow function** — Each wave closure MUST be `async` so any synchronous throw becomes a rejected promise captured by `Promise.allSettled`, not an unhandled exception.

**Done when:** Waves execute sequentially. Features within each wave run concurrently via `Promise.allSettled`. `markReady` is called in `finally` for every feature. Only fulfilled loads are dispatched. All existing behavior (timeout, dep resolution, error handling) is preserved.

### Step 4: Update test "resolves features with equal priority in stable input order"
Change assertion from `expect(order).toEqual(['first', 'second', 'third'])` to verify all 3 features ran regardless of order.

**Done when:** Test passes under concurrent within-wave execution.

### Step 5: Add test — same-priority features run concurrently
Two global features at the same priority: one with a 200ms async `onSetup`, one synchronous. Verify the fast one's `onSetup` executes before the slow one completes.

**Done when:** Test proves concurrent execution (fast not blocked by slow peer).

### Step 6: Add test — multiple features depend on same feature (resolver fix)
F1, F2, F3 all depend on A, all at the same priority. Verify all 3 run after A completes.

**Done when:** All 3 dependents execute their `onSetup` after A's `markReady`.

### Step 7: Add test — cross-wave dependency promotion
A(p=1, deps=[B]) and B(p=25). Verify both run (A waits for B), and a promotion warning is emitted.

**Done when:** Both features initialize, warning about promotion logged.

### Step 8: Add test — diamond dependency across waves
D(p=1, no deps), B(p=5, deps=[D]), C(p=5, deps=[D]), A(p=10, deps=[B,C]). Verify correct resolution order.

**Done when:** D runs in wave 1, B and C run concurrently in wave 5 (after D), A runs in wave 10 (after B and C).

### Step 9: Add test — cross-priority ordering preserved
Features at p=1 and p=10 with no dependencies between them. Verify p=1 features complete before p=10 features start.

**Done when:** Timing assertion confirms sequential wave execution.

### Step 10: Run full test suite
**Done when:** `vitest` passes all tests including new ones. Zero regressions.

## Interfaces

No new public types required. Internal types and function signatures:

```typescript
interface LoadedFeature {
  meta: FeatureMeta;
  descriptor: FeatureDescriptor;
}

interface DependencyGate {
  markReady: (id: string) => void;
  waitForDependency: (id: string) => Promise<void>;
}

interface TopoSortResult {
  sorted: FeatureMeta[];
  prunedEdges: Set<string>;
}

function groupIntoWaves(sorted: FeatureMeta[], warn: LogFn): Map<number, FeatureMeta[]>
function createDependencyGate(allFeatures: FeatureMeta[], matchedIds: Set<string>): DependencyGate
function topoSort(matched: FeatureMeta[], warn: LogFn): TopoSortResult
function withTimeout<T>(promise: Promise<T>, ms: number, id: string, controller?: AbortController): Promise<T>
function initFeature(feature: FeatureDescriptor, selectors: string[], signal?: AbortSignal): Promise<void>
function runWithDeps(meta, descriptor, knownIds, gate, prunedEdges, warn, signal?): Promise<void>
function dispatchWaves(waves, descriptorById, knownIds, gate, prunedEdges, globalTimeout, warn): Promise<void>
```

Existing public types (`FeatureMeta`, `FeatureDescriptor`, `LoaderOptions`) remain unchanged.

## Function Design

### `src/loader.ts`

| Function | Concern | Change |
|----------|---------|--------|
| `resolveTimeout` | Validate timeout input | **New** — extracted from loadFeatures |
| `matchFeatures` | Filter by DOM + sort by priority | None |
| `withTimeout` | Race promise vs setTimeout + abort | **Simplified** — `ms: number`, optional `AbortController` |
| `initFeature` | Per-feature lifecycle (onSetup→onEach→onReady) | **Modified** — optional `AbortSignal`, checks before each step |
| `topoSort` | DFS topo-sort + cycle detection | **Modified** — returns `TopoSortResult` with `prunedEdges` |
| **`groupIntoWaves`** | Group features by effective wave (priority + dep promotion) | **New** |
| **`createDependencyGate`** | Pub/sub gate (readySet + depResolvers) | **New** — extracted, uses `Map<string, Set<>>` |
| **`runWithDeps`** | Validate deps + wait + init | **New** — extracted, filters pruned edges + self-deps |
| **`dispatchWaves`** | Wave iteration + concurrent dispatch | **New** — extracted, AbortController per feature |
| `loadFeatures` | Orchestrator: match → sort → load → dispatch | **Refactored** — ~40 lines, delegates to extracted functions |

### `groupIntoWaves` detail

**Precondition:** Input must be in topoSort order (dependencies appear before dependents). This guarantees single-pass correctness.

Maintain `effectiveWave: Map<string, number>` keyed by feature ID. Single-pass over input:
1. Start with `wave = feature.priority`
2. For each dep in `feature.dependencies`: look up `effectiveWave.get(depId)`. If dep is NOT in the map (unmatched/failed-load feature, already pre-seeded as ready), **skip** — it does not trigger promotion. If found and `> wave`, update `wave` to that value.
3. Store `effectiveWave.set(feature.id, wave)`
4. If `wave !== feature.priority`, emit warning: `[loader] Feature "${id}" promoted from priority ${feature.priority} to wave ${wave} — depends on "${depId}" in later wave`
5. Group into `Map<number, FeatureMeta[]>` keyed by effective wave

### `loadFeatures` dispatch refactor

Replace lines 163-207:
1. Pre-process: pair each `sorted[i]` with `results[i]`. Handle rejected loads (warn + markReady).
2. Group successful loads into waves via `groupIntoWaves`.
3. Get sorted wave keys: `[...waves.keys()].sort((a, b) => a - b)`
4. For each wave: `await Promise.allSettled(waveFeatures.map(f => runFeature(f)))` where `runFeature` is the existing async closure (validate deps → waitForDependency → initFeature → markReady).

## Acceptance Criteria (EARS)

- **AC-1.** When features share the same priority value and have no mutual dependencies, the system shall initialize them concurrently within a single wave.
- **AC-2.** When features have different priority values, the system shall execute lower-priority-value waves before higher-priority-value waves sequentially.
- **AC-3.** When a feature declares dependencies, it shall wait for those specific dependencies to complete before its own initialization, regardless of wave placement.
- **AC-4.** When multiple features depend on the same feature, all dependents shall be unblocked when that dependency completes.
- **AC-5.** When a feature's declared dependency has a higher priority value (later wave), the system shall promote the feature to that wave and emit a warning matching the pattern: `[loader] Feature "${id}" promoted from priority N to wave M — depends on "${depId}" in later wave`.
- **AC-6.** If a feature in a wave times out or fails, it shall not prevent other features in the same wave or subsequent waves from initializing. `markReady` shall fire in a `finally` block guaranteeing dependents unblock.
- **AC-7.** When circular dependencies exist, the back-edge shall be pruned by `topoSort` and skipped by `runWithDeps`. Both features shall complete normally without timeout. A circular dependency warning shall be emitted.
- **AC-8.** When a feature times out, its lifecycle shall be cancelled via `AbortSignal`. `onSetup` (if not yet started), `onEach`, and `onReady` shall not execute after abort.
- **AC-9.** When a feature's dependency fails to load (chunk rejected), the system shall skip the dependent feature, emit a warning `Feature "${id}" skipped — dependency "${depId}" failed`, and propagate the failure to any feature depending on the skipped feature.
- **AC-10.** All existing tests (except modified ordering/circular tests) shall pass without changes.

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
| 10 | `enabled: false` on descriptor | [inferred] | `initFeature` returns early (L61). Feature's async task completes normally. `markReady` fires. Dependents unblock. |
| 11 | `onSetup` returns `false` (abort) | [inferred] | `initFeature` skips onEach/onReady, returns normally (L66). `markReady` fires. Dependents unblock. |
| 12 | Cascading promotion: A(p=1,deps=[B]), B(p=5,deps=[C]), C(p=10) | [inferred] | Single-pass in topoSort order: C processed first → wave 10. B next → `max(5, 10)` = wave 10. A last → `max(1, 10)` = wave 10. All three land in wave 10. Two promotion warnings emitted. |
| 13 | Intra-wave dep: A and B same priority, B deps on A | [inferred] | Both in same wave. Both launch concurrently. B calls `waitForDependency('A')`. A runs lifecycle, calls `markReady`. B unblocks. Wave completes when both settle. |
| 14 | Empty features array / no DOM matches | [inferred] | Returns early at existing L131. No change needed. |

## Done Criteria per Feature

| Feature | Done when ACs pass |
|---------|-------------------|
| Resolver Set fix | AC-4, AC-6 |
| Wave grouping (`groupIntoWaves`) | AC-1, AC-2, AC-5 |
| Concurrent dispatch (wave loop) | AC-1, AC-3, AC-6 |
| Cross-wave dependency promotion | AC-5 |
| Pruned-edge cycle resolution | AC-7 |
| AbortController cancellation | AC-8 |
| Dependency failure propagation | AC-9 |
| Test updates | AC-10 |

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | Features at the same priority that relied on implicit sequential ordering now run concurrently — potential breakage for consumers with shared mutable state between same-priority features | Changelog note. Package is pre-1.0 (`0.0.0-development`). The correct mechanism for ordering is `dependencies`, not priority within a group. |
| 2 | Timeout semantic change: timeout now includes dep-wait time for within-wave dependencies (previously, in sequential mode, deps completed before the feature's timeout started) | Document in changelog. Bounded by existing timeout configuration. Consumers can increase timeout or set `timeout: 0` to disable. |
| 3 | Test flakiness from timing-dependent assertions in concurrency tests | Prefer call-order tracking (push to array inside onSetup mock, assert ordering after await) over `Date.now()` deltas. For concurrency proof, set a flag during slow feature's onSetup to verify fast already ran. |
| 4 | Wave-level stall: a slow or hung feature blocks all subsequent waves until its timeout fires | Consumers must set per-feature timeouts on features that may hang. Document this requirement in changelog. Consider per-wave timeout as future option. |
| 5 | Synchronous throw in per-feature wave closure escapes `Promise.allSettled` if not declared `async` | Each wave feature closure MUST be an `async` arrow function so any synchronous throw becomes a rejected promise captured by `allSettled`. |

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
- **260 total tests**, all passing
- **Concurrency verification:** Barrier pattern (Promise-based coordination) instead of setTimeout timing
