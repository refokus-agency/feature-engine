---
issue_number: 24
issue_title: "Smoke tests + performance benchmarks for parallel feature initialization"
repo: "refokus-agency/feature-engine"
labels: []
plan_level: "standard"
depth: "medium"
branch_name: "feat/24-smoke-tests-and-benchmarks"
created_at: "2026-05-25T00:00:00Z"
---

# Implementation Plan: #24 — Smoke tests + performance benchmarks for parallel feature initialization

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | create | `src/__tests__/loader.smoke.test.ts` | End-to-end smoke tests with real async delays, wall-clock assertions, and blocked-feature tracking |
| 2 | create | `src/__tests__/loader.bench.ts` | Vitest bench file measuring loadFeatures throughput with real delays across sequential vs parallel scenarios |
| 3 | modify | `vite.config.ts` | Add `bench` configuration with include pattern for `*.bench.ts` |
| 4 | modify | `package.json` | Add `"bench": "vitest bench"` script |

## Codebase Context

- **Test framework:** Vitest 3.2.4, jsdom environment, globals enabled
- **Factory helpers:** `makeDescriptor`, `makeMeta`, `makeLoadable` in `loader.test.ts` — reuse same pattern in smoke/bench files
- **Import convention:** `.ts` extensions in imports (tsconfig `rewriteRelativeImportExtensions: true`)
- **Module system:** ESM-only (`"type": "module"`), Node >= 24
- **Async test pattern:** Real `setTimeout` delays with `performance.now()` measurement — no fake timers in any loader test
- **Concurrency proof pattern:** Barrier pattern (manually resolved promise) already used in existing tests — extend to smoke tests
- **Console mocking:** `vi.spyOn(console, 'warn').mockImplementation(noop)` for tests that don't assert warnings

## Steps

### 1. Add bench config to `vite.config.ts`
Add `bench: { include: ['src/**/*.bench.ts'] }` to the vitest config alongside the existing `test` block.

**Done when:** `defineConfig` includes `bench.include` pattern and existing `test` config is unchanged.

### 2. Add bench script to `package.json`
Add `"bench": "vitest bench"` to the `scripts` section.

**Done when:** `npm run bench` executes `vitest bench` without errors.

### 3. Create smoke test file with real async delays
Create `src/__tests__/loader.smoke.test.ts` with 6 integrated scenarios that exercise the full `loadFeatures` pipeline with controlled async delays.

**Done when:** `vitest run loader.smoke` passes all 6 smoke tests, each asserting wall-clock time and feature execution order.

### 4. Create benchmark file with delay-based scenarios
Create `src/__tests__/loader.bench.ts` with 4 benchmark scenarios comparing sequential vs parallel dispatch using real delays.

**Done when:** `vitest bench` runs and reports ops/sec for all 4 scenarios.

### 5. Run and validate results
Execute both smoke tests and benchmarks. Verify parallel scenarios show measurably lower wall-clock time than sequential equivalents.

**Done when:** Parallel scenarios show measurably lower wall-clock time than sum of individual delays.

## Interfaces

No new interfaces needed — reuses existing `FeatureMeta`, `FeatureDescriptor`, `LoaderOptions`.

## Function Design

### `src/__tests__/loader.smoke.test.ts`
- `makeDelayedLoadable(id, delayMs, meta)` — creates a `FeatureMeta` with `onSetup` that resolves after `delayMs` via `setTimeout`, tracking start/end timestamps per feature
- `measureExecution(features, options?)` — wraps `loadFeatures` with `performance.now()` timing, returns `{ elapsed, executionLog }` where `executionLog` tracks per-feature start/end/blocked-by info

### `src/__tests__/loader.bench.ts`
- `buildFeatures(n, waves)` — generates N global features with controlled delays distributed across W priority waves for benchmarking

## Acceptance Criteria (EARS)

- **AC-1.** When `loadFeatures` runs N features with async delays across W waves, total wall-clock time **shall** be approximately `sum(max delay per wave)`, not `sum(all delays)`.
- **AC-2.** When a slow feature (Xms) runs in a wave with fast features, the fast features **shall** complete before the slow feature finishes.
- **AC-3.** When a feature depends on a feature in a previous wave, it **shall** wait for that dependency but not block its same-wave peers.
- **AC-4.** When a feature with async work fails, dependent features **shall** be skipped without adding their delay to total time.
- **AC-5.** The benchmark suite **shall** measure real async scenarios and report ops/sec showing parallel dispatch is faster than forced-sequential dispatch.
- **AC-6.** Smoke tests **shall** track and assert which features were blocked and by whom.
- **AC-7.** If a smoke test fails, the assertion message **shall** include actual vs expected timing and the feature execution order.

## Out of Scope

- CI regression gates (no automated threshold checks or performance budgets)
- Browser-based benchmarks (all run in jsdom)
- Benchmarking `defineFeature` or the Vite plugin — only `loadFeatures` is measured

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Timer precision in jsdom may be lower than browser | [inferred] | Use generous margins (2-3x expected time) in timing assertions |
| 2 | CI runners may be slower, inflating absolute times | [inferred] | Assert ratios (parallel/sequential) rather than absolute times where possible |
| 3 | Feature timeout may fire before test delay completes | [inferred] | Set feature timeout >> test delay to avoid false timeouts |
| 4 | Benchmark warm-up variance | [inferred] | vitest bench handles warm-up natively; no manual warm-up needed |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Smoke Tests | AC-1, AC-2, AC-3, AC-4, AC-6, AC-7 all pass |
| Benchmarks | AC-5 passes: parallel scenarios show better throughput than sequential |

## Risks

| Risk | Mitigation |
|------|------------|
| jsdom timer precision | Use `performance.now()` + generous margins; assert ratios not absolutes |
| Flaky timing assertions in CI | Margins at 2-3x expected; ratio-based assertions where possible |
| vitest bench jsdom compatibility | Bench file uses global features only (no real DOM queries) |

## Test Strategy

### Smoke Tests (6 scenarios)

1. **"3 waves × 3 features × 50ms — total time ≈ 150ms, not 450ms"**
   - 9 features (3 per wave), each `onSetup` takes 50ms
   - Assert: wall-clock < 250ms (generous margin), all features completed

2. **"1 slow feature (200ms) doesn't block same-wave peers"**
   - Wave 1: [slow=200ms, fast-a=10ms, fast-b=10ms]
   - Assert: fast-a and fast-b complete while slow is still running (barrier pattern)
   - Assert: total wall-clock ≈ 200ms, not 220ms

3. **"Cross-wave dependency: blocked feature waits, unblocked peers proceed"**
   - Wave 1: [A=100ms], Wave 2: [B depends on A + 50ms, C no deps + 50ms]
   - Assert: C runs in parallel with B's dependency wait
   - Track which features were blocked and by whom

4. **"Failure cascade with async features — timing of propagation"**
   - A=100ms then throws, B depends on A (50ms), C depends on B (50ms), D independent (200ms)
   - Assert: B and C are skipped (not executed), D completes normally
   - Assert: total time ≈ max(A's 100ms, D's 200ms), not 100+50+50+200

5. **"Mixed DOM-selector + global features with varying delays"**
   - DOM features (30ms each) + global features (80ms each) across 3 waves
   - Assert: unmatched DOM features don't block, matched ones run in parallel within wave

6. **"Large graph: 50 features, 5 waves, staggered delays (10-100ms)"**
   - Each feature gets deterministic delay via `(index * 7 + 13) % 90 + 10`
   - Assert: total wall-clock < sum of all delays (proves parallelism)
   - Log: actual time vs theoretical-sequential time

### Benchmarks (4 scenarios via vitest bench)

All use real async delays (`onSetup: () => new Promise(r => setTimeout(r, delayMs))`):

1. **"Baseline: 10 features × 20ms, single wave (priority=1)"** — all concurrent → ~20ms per iteration
2. **"Sequential comparison: 10 features × 20ms, each different priority"** — 10 separate waves → ~200ms per iteration
3. **"Parallel: 50 features × 10ms, 5 waves (10 per wave)"** — expected ~50ms per iteration
4. **"Parallel with deps: 30 features, 3 waves, cross-wave deps, 15ms each"** — expected ~45ms + dep overhead

Comparing scenarios 1 vs 2 directly demonstrates the parallel speedup from the wave dispatch system.
