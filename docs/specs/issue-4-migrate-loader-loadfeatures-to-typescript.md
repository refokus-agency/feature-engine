---
issue_number: 4
issue_title: "Migrate loader (loadFeatures) to TypeScript"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "lean"
depth: "medium"
branch_name: "feat/4-migrate-loader-to-typescript"
created_at: "2026-04-24T12:00:00Z"
updated_at: "2026-04-24T19:05:00Z"
---

# Implementation Plan: #4 — Migrate loader (loadFeatures) to TypeScript

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/loader.ts` | Replace stub with full implementation (matchFeatures, topoSort, withTimeout, initFeature, loadFeatures) |
| 2 | create | `src/__tests__/loader.test.ts` | 22 tests covering all functions through the public API |

## Codebase Context

- `FeatureMeta`, `FeatureDescriptor`, `LoaderOptions` types already defined in `src/types.ts` — reuse directly
- `defineFeature` pattern: named exports, `.ts` import extensions, `[module]` prefix for warnings, sequential if-guards
- Original JS source at `webflow-custom-code-tmp/src/loader.js` — port logic 1:1, adapting for parameterized features
- `jsdom` test environment (vitest) — DOM APIs available in tests
- No runtime dependencies — keep it that way

## Steps

1. **Implement internal helpers in `src/loader.ts`** — `matchFeatures`, `withTimeout`, `initFeature`, `topoSort` ✅
   **Done when:** all four functions compile with strict types and match original JS behavior

2. **Implement `loadFeatures` orchestrator in `src/loader.ts`** ✅
   **Done when:** `loadFeatures` accepts `(features: FeatureMeta[], options?: Partial<LoaderOptions>)` and orchestrates match → sort → parallel load → serial init with dependency resolution

3. **Update `src/index.ts` if needed for re-export compatibility** ✅
   **Done when:** barrel export of `loadFeatures` compiles without error (no changes needed — existing re-export works with new signature)

4. **Create tests in `src/__tests__/loader.test.ts`** ✅
   **Done when:** tests cover all 13 edge cases + happy path, all passing

5. **Run type check + full test suite** ✅
   **Done when:** `npm run check-types` and `npm test` pass with zero errors

6. **Fix review findings (P1 + P2)** ✅ [added during implementation]
   **Done when:** all code review findings addressed — `enabled` guard, invalid selector handling, negative timeout validation, deadlock warning, timer initialization, topoSort warning improvement, strengthened test assertions

## Interfaces

No new interfaces needed. All required types already exist in `src/types.ts`:

- `FeatureMeta` — input metadata for each feature (id, selectors, priority, global, dependencies, timeout, load)
- `FeatureDescriptor` — resolved feature with lifecycle hooks (onSetup, onEach, onReady)
- `LoaderOptions` — global loader config (timeout: number, logging: boolean)
- `LogFn` — internal type alias `(message: string, ...args: unknown[]) => void` for conditional logging

**Signature change:** `loadFeatures(features: FeatureMeta[], options?: Partial<LoaderOptions>)` — decouples from `virtual:feature-metadata` import (Vite plugin is issue #5). Features are passed as a parameter instead of imported from a virtual module.

## Function Design

| File | Function | Single Concern |
|------|----------|---------------|
| `src/loader.ts` | `matchFeatures(features: FeatureMeta[], warn: LogFn): FeatureMeta[]` | Filter features by DOM selector match + globals, sort by priority ascending. Catches invalid CSS selectors per-selector. |
| `src/loader.ts` | `withTimeout<T>(promise: Promise<T>, ms: number \| null, id: string, defaultTimeout: number): Promise<T>` | Wrap promise in `Promise.race` with configurable timeout. Timer initialized safely. |
| `src/loader.ts` | `initFeature(feature: FeatureDescriptor, selectors: string[]): Promise<void>` | Guard `enabled === false`, then run `onSetup` → `onEach` → `onReady` lifecycle |
| `src/loader.ts` | `topoSort(matched: FeatureMeta[], warn: LogFn): FeatureMeta[]` | DFS topological sort with cycle detection inside dep loop — warns naming both endpoints |
| `src/loader.ts` | `loadFeatures(features: FeatureMeta[], options?: Partial<LoaderOptions>): Promise<void>` | Orchestrator: validate timeout → match → sort → parallel chunk load → serial init with dependency resolution. `withTimeout` wraps both dep-wait and init to mitigate circular dep deadlock. |

## Acceptance Criteria (EARS)

- **AC-1.** The system shall export `loadFeatures` as an async function with strict TypeScript types.
- **AC-2.** When features declare dependencies, the system shall resolve them via topological sort (DFS) and initialize dependents only after dependencies complete.
- **AC-3.** When no per-feature timeout is set, the system shall apply the global timeout (default 10,000ms, configurable via `options.timeout`).
- **AC-4.** Features shall be initialized serially in topological order after parallel chunk loading.
- **AC-5.** If a feature's initialization exceeds its timeout, the system shall reject with a timeout error and continue to the next feature.
- **AC-6.** If a `FeatureDescriptor` has `enabled === false`, the system shall skip its entire lifecycle (onSetup, onEach, onReady). [discovered during review]
- **AC-7.** If `options.timeout` is negative, the system shall warn and fall back to the default timeout (10,000ms). [discovered during review]

## Out of Scope

- Vite plugin integration (`virtual:feature-metadata`) — issue #5
- Feature registration/discovery mechanism — features are passed as parameter
- Browser compatibility polyfills — assumes ES2022+ environment
- Full circular dependency resolution — circular deps are mitigated (timeout), not prevented (see Risks)

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|---------|
| 1 | Hanging feature (unresolved promise) | [from issue] | `withTimeout` rejects after configured ms; `markReady` called so subsequent features proceed |
| 2 | Circular dependency | [inferred] | `console.warn` naming both endpoints; `withTimeout` wraps dep-wait + init so first feature in cycle times out, second proceeds |
| 3 | Unknown dependency ID | [inferred] | `console.warn` and ignore that dependency |
| 4 | Chunk load failure (`status: "rejected"`) | [inferred] | `console.warn`, `markReady`, continue |
| 5 | No matching features in DOM | [inferred] | Early return (no-op) |
| 6 | `onSetup` returns `false` | [inferred] | Skip `onEach` and `onReady` for that feature |
| 7 | `logging: false` option | [inferred] | All `console.warn` calls suppressed |
| 8 | Empty features array | [inferred] | Early return (no-op) |
| 9 | Feature with `timeout === 0` | [inferred] | No timeout applied, promise runs unbounded |
| 10 | Invalid CSS selector | [discovered during review] | `try/catch` in `matchFeatures` — warn and skip that selector, not the entire feature |
| 11 | `FeatureDescriptor.enabled === false` | [discovered during review] | `initFeature` returns immediately, skipping all hooks |
| 12 | Negative global timeout | [discovered during review] | `loadFeatures` warns and falls back to `DEFAULT_TIMEOUT_MS` (10,000ms) |
| 13 | Circular deps + zero timeout | [discovered during review] | Warn about deadlock risk — `withTimeout` with `timeout <= 0` bypasses the race, so circular deps will deadlock |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| loadFeatures TypeScript migration | AC-1, AC-4, AC-6 |
| Topological sort | AC-2 |
| Configurable timeout | AC-3, AC-5, AC-7 |
| Serial execution | AC-4 |

## Risks

| Risk | Mitigation |
|------|-----------|
| Signature change (`features` param) may surprise if anyone depends on the stub | Stub throws `Not implemented` anyway — not usable; `index.ts` re-export unchanged |
| DOM APIs in unit tests | vitest jsdom environment already configured and proven in defineFeature tests |
| Circular dependencies cause first feature in cycle to timeout (not fail-fast) | Intentional design decision — alternatives (position-based skip, fail-fast throw) were evaluated and deferred. Timeout mitigation is sufficient for current scope. See PR notes. |
| Invalid CSS selectors could crash the loader | Mitigated: `matchFeatures` catches `SyntaxError` per-selector and warns |

## Test Strategy

- Test through public API (`loadFeatures`) with mock `FeatureMeta` arrays
- `jsdom` for DOM scanning tests (set `document.body.innerHTML`, verify feature matching)
- Mock `load()` functions returning mock `FeatureDescriptor` objects
- 22 tests covering:
  - Happy path (5): global feature, DOM selector match, lifecycle order, ctx passing, priority sort
  - Dependency ordering (3): deps before dependents, circular deps (timeout + warn), unknown deps
  - Timeout (5): per-feature timeout, AC-5 continuation, global timeout fallback, zero timeout, negative timeout
  - Chunk failure (1): warn + continue
  - Edge cases (8): empty array, no match, onSetup false, enabled false, logging suppression, unmatched pre-seed, invalid CSS selector, deadlock risk warning
- Run existing `defineFeature` tests to verify no regressions (36 tests)
- Total: 58 tests passing
