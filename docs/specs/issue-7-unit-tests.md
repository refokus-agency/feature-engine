---
issue_number: 7
issue_title: "Unit tests"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/7-unit-tests"
created_at: "2026-04-27T12:55:00Z"
---

# Implementation Plan: #7 — Unit tests

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/__tests__/define-feature.test.ts` | Add edge-case validation tests (null id, empty selectors, timeout Infinity/NaN) |
| 2 | modify | `src/__tests__/loader.test.ts` | Add deep-chain topo sort, onEach shape assertion, onReady-without-onSetup, per-feature timeout override |
| 3 | modify | `src/__tests__/vite-plugin.test.ts` | Add handleHotUpdate, load-non-virtual, readFileSync failure, globSync failure, empty deps literal, string-keyed props |

## Codebase Context

- **Test framework:** Vitest ^3.2.4, jsdom environment, `globals: true`
- **Mocking patterns:** `vi.spyOn(console, 'warn')` + `vi.fn()` for lifecycle spies; no `vi.mock()` usage
- **Factory functions:** `minimal()` (define-feature), `makeDescriptor()`/`makeMeta()`/`makeLoadable()` (loader), `featureSource()`/`setupFixture()` (vite-plugin)
- **Timer approach:** Real timers with short durations (50ms); no `vi.useFakeTimers()`
- **Vite plugin integration:** Uses `node:fs` tmp directories, cleaned in `afterAll`
- **Current state:** 99 tests across 3 files, all passing

## Steps

### Step 1: Add defineFeature edge-case tests
Add tests to `src/__tests__/define-feature.test.ts`:
- `id: null` → throws (falsy caught by `!descriptor.id`)
- `selectors: []` with `global: true` → valid, accepted
- `timeout: Infinity` → accepted (documents current behavior; `Infinity > 0` passes guard)
- `timeout: NaN` → accepted (documents current behavior; `NaN <= 0` is false, passes guard)

**Done when:** all 4 new tests present and pass

### Step 2: Add loader deep-chain dependency test
Add test to `src/__tests__/loader.test.ts` under `dependency ordering`:
- 3-level chain: C depends on B, B depends on A — assert initialization order is A → B → C

**Done when:** test with 3-level deep chain passes and asserts correct order

### Step 3: Add loader onEach shape and onReady-without-onSetup tests
Add tests to `src/__tests__/loader.test.ts`:
- `onEach` receives `{ el, index, elements, ctx }` with correct element reference, correct index, full NodeList, and ctx from onSetup
- `onReady` fires when `onSetup` is `null` but `onEach` is present

**Done when:** both tests pass with correct assertions on all four properties of the onEach argument

### Step 4: Add loader per-feature timeout override test
Add test to `src/__tests__/loader.test.ts`:
- Feature with `timeout: 200` and global `timeout: 50` → feature survives past 50ms, proving per-feature wins

**Done when:** test demonstrates per-feature timeout takes precedence over global

### Step 5: Add Vite plugin missing-path tests
Add tests to `src/__tests__/vite-plugin.test.ts`:
- `handleHotUpdate` with `.feature.js` file → invalidates virtual module
- `handleHotUpdate` with non-`.feature.js` file → returns undefined
- `load` called with non-virtual module ID → returns undefined
- `readFileSync` failure → warns and continues with remaining files
- `globSync` failure → warns and returns empty array

**Done when:** all 5 tests pass

### Step 6: Add parseFeatureFile gap tests
Add tests to `src/__tests__/vite-plugin.test.ts`:
- `dependencies: []` explicitly present → parsed as empty array
- String-keyed properties (`"id": "foo"` with quotes around key) → correctly extracted

**Done when:** both tests pass

### Step 7: Run full test suite
Run `vitest run` and confirm:
- 0 failures
- Total test count ≥ 120

**Done when:** all tests pass with ≥120 total

## Interfaces

No new interfaces — tests consume existing types (`FeatureDescriptorInput`, `FeatureDescriptor`, `FeatureMeta`, `LoaderOptions`).

## Function Design

No new production functions. Test-only additions follow existing factory patterns in each file.

## Acceptance Criteria (EARS)

- **AC-1.** The test suite **shall** cover descriptor validation for required fields (`id`, `selectors`, `priority`, at-least-one-hook) and invalid fields (`priority: Infinity/NaN`, `timeout: Infinity`, `null` id, empty selectors array).
- **AC-2.** The test suite **shall** cover topological sort of dependencies including correct ordering, circular dependency detection, and deep chains (3+ levels).
- **AC-3.** The test suite **shall** cover timeout behavior: hanging feature does not block others, per-feature timeout overrides global, timer cleanup on early resolution, `timeout: 0` disables.
- **AC-4.** The test suite **shall** cover lifecycle hooks: `onSetup → onEach → onReady` order, `onSetup` returning `false` aborts, `onEach` receives correct `{ el, index, elements, ctx }` shape, `onReady` fires when `onSetup` is absent.
- **AC-5.** The test suite **shall** cover Vite plugin gaps: `handleHotUpdate` hook, `globSync` failure fallback, `load` returning `undefined` for non-virtual IDs, and `readFileSync` failure recovery.
- **AC-6.** The test suite **shall** cover `parseFeatureFile` gaps: empty `dependencies: []` literal, and string-keyed properties.
- **AC-7.** When all tests pass, the combined test count **shall** be ≥120 (current: 99).

## Out of Scope

- Code coverage thresholds (no minimum % gate configured)
- Fixing discovered bugs (e.g., `timeout: NaN`/`Infinity` passing validation) — those belong in separate issues
- E2E or integration tests beyond what the Vite plugin tmpdir pattern already provides

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | `timeout: NaN` passes defineFeature validation | [inferred] | Test documents current behavior (NaN accepted); flag as potential bug |
| 2 | `timeout: Infinity` passes defineFeature validation | [inferred] | Test documents current behavior (Infinity accepted); flag as potential bug |
| 3 | Circular dep in 3-node cycle (A→B→C→A) | [inferred] | Test that loader warns and eventually times out, does not hang |
| 4 | `handleHotUpdate` on non-`.feature.js` file | [inferred] | Test that plugin returns undefined (no invalidation) |
| 5 | `handleHotUpdate` with null module from moduleGraph | [inferred] | Test that plugin handles missing module gracefully |
| 6 | `readFileSync` throws for unreadable file | [inferred] | Test that plugin warns and skips file |
| 7 | `globSync` throws for invalid pattern | [inferred] | Test that plugin warns and returns empty array |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| defineFeature validation gaps | AC-1 |
| Topological sort gaps | AC-2 |
| Timeout gaps | AC-3 |
| Lifecycle hook gaps | AC-4 |
| Vite plugin gaps | AC-5, AC-6 |
| Total test count | AC-7 |

## Risks

| Risk | Mitigation |
|------|------------|
| Timer-sensitive tests may flake on slow CI | Use generous timeouts (100ms+) for timing-dependent assertions |
| `handleHotUpdate` mocking requires simulating Vite's `server.moduleGraph` API | Keep mock minimal — test behavior, not Vite internals |

## Test Strategy

- **Extend** existing test files following established patterns (`vi.fn`, `vi.spyOn`, factory functions)
- **Black-box:** call public API, assert observable behavior
- **handleHotUpdate:** create minimal mock of Vite's `HmrContext` with `server.moduleGraph` stub
- **globSync failure:** use a custom `include` pattern that triggers the catch branch (or mock `globSync`)
- **Validation:** run `vitest run` to confirm all tests pass with 0 failures and count ≥120
