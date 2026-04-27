---
issue_number: 4
issue_title: "Migrate loader (loadFeatures) to TypeScript"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "lean"
depth: "medium"
branch_name: "feat/create-refokusfeature-engine-as-reusable-npm-package"
created_at: "2026-04-27T00:00:00Z"
updated_at: "2026-04-27T10:00:00Z"
---

# Implementation Plan: #4 — Migrate loader (loadFeatures) to TypeScript

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | create | src/types.ts | Core type definitions (FeatureDescriptor, FeatureDescriptorInput, FeatureMeta, LoaderOptions) |
| 2 | create | src/loader.ts | loadFeatures() implementation — 1:1 toggl port with DOM scanning, topo sort, serial execution, timeout |
| 3 | modify | src/index.ts | Update barrel to export loadFeatures + types (remove template example) |
| 4 | create | src/__tests__/loader.test.ts | Comprehensive test suite for loader (24 tests) |
| 5 | modify | tsconfig.json | Add DOM lib, declaration: true, fix exclude pattern |
| 6 | modify | vite.config.ts | Switch test environment to jsdom |
| 7 | modify | package.json | Rename to @refokus-agency/feature-engine, add jsdom devDep, ESM-only exports |
| 8 | delete | src/example/index.ts | Remove template scaffold |
| 9 | delete | src/example/__tests__/index.test.ts | Remove template scaffold tests |

## Codebase Context

- Uses @total-typescript/tsconfig base with "no-dom/library" — must add DOM + DOM.Iterable to lib
- vitest with jsdom for DOM tests; beforeEach resets document.body
- Named exports only, no default exports for modules
- .ts extensions in imports (rewriteRelativeImportExtensions: true)
- Zero production deps — all devDependencies only
- Single quotes, semicolons, trailing commas (Prettier config)
- Error/warn messages prefixed with `[loader]`
- import type { ... } for type-only imports
- **Critical:** API must be 1:1 with toggl-site-custom-code loader (selectors-as-arg, ctx-passing pattern)

## Steps

1. **Update package.json**: rename to @refokus-agency/feature-engine, add jsdom devDep, remove CJS export → package.json ✅
   **Done when:** npm install succeeds and package.json has jsdom in devDependencies

2. **Update tsconfig.json**: add `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"declaration": true`, fix exclude to `src/__tests__` → tsconfig.json ✅
   **Done when:** tsc --noEmit passes with DOM types available

3. **Update vite.config.ts**: set test.environment to 'jsdom' → vite.config.ts ✅
   **Done when:** vitest can run tests that access document

4. **Create src/types.ts** with FeatureDescriptor, FeatureDescriptorInput, FeatureMeta, LoaderOptions using toggl-compatible callback signatures → src/types.ts ✅
   **Done when:** types compile with no errors and are importable from other modules

5. **Create src/loader.ts** with loadFeatures, matchFeatures, topoSort, withTimeout, initFeature — 1:1 toggl port → src/loader.ts ✅
   **Done when:** loadFeatures exports with correct signature and passes type-check

6. **Update src/index.ts** barrel to export loadFeatures + all types → src/index.ts ✅
   **Done when:** `import { loadFeatures, FeatureDescriptor } from './index.ts'` resolves

7. **Delete src/example/** — remove template scaffold → src/example/ ✅
   **Done when:** directory removed, no dangling imports

8. **Create src/__tests__/loader.test.ts** with full test suite (24 tests) → src/__tests__/loader.test.ts ✅
   **Done when:** vitest passes all tests including timeout, topo sort, and edge cases

## Interfaces

```typescript
interface FeatureDescriptor {
  id: string;
  selectors: readonly string[];
  priority: number;
  global: boolean;
  dependencies: readonly string[];
  enabled: boolean;
  timeout: number | null;
  onSetup: ((selectors: string[]) => unknown | false | Promise<unknown | false>) | null;
  onEach: ((params: {
    el: Element;
    index: number;
    elements: NodeListOf<Element>;
    ctx: unknown;
  }) => void | Promise<void>) | null;
  onReady: (() => void | Promise<void>) | null;
}

interface FeatureDescriptorInput {
  id: string;
  selectors: string[];
  priority: number;
  global?: boolean;
  dependencies?: string[];
  enabled?: boolean;
  timeout?: number | null;
  onSetup?: FeatureDescriptor['onSetup'];
  onEach?: FeatureDescriptor['onEach'];
  onReady?: FeatureDescriptor['onReady'];
}

interface FeatureMeta {
  id: string;
  selectors: readonly string[];
  priority: number;
  global: boolean;
  dependencies: readonly string[];
  timeout: number | null;
  load: () => Promise<{ default: FeatureDescriptor }>;
}

interface LoaderOptions {
  timeout: number;
  logging: boolean;
}
```

## Function Design

| File | Function | Single Concern |
|------|----------|----------------|
| src/loader.ts | `loadFeatures(features, options?)` | Orchestrates full pipeline: match → sort → load chunks → init serial |
| src/loader.ts | `matchFeatures(features, warn)` | DOM selector scan + global filter, returns MatchedFeature[] with validSelectors |
| src/loader.ts | `topoSort(matched, warn)` | DFS topological sort with cycle detection via inStack set |
| src/loader.ts | `withTimeout<T>(promise, ms, id)` | Promise.race wrapper; ms<=0 bypasses timeout |
| src/loader.ts | `initFeature(feature, selectors)` | Runs onSetup→onEach→onReady lifecycle; ctx threading; false-abort |

## Acceptance Criteria (EARS)

- **AC-1.** The system shall export `loadFeatures(features: FeatureMeta[], options?: Partial<LoaderOptions>): Promise<void>` with strict TypeScript types.
- **AC-2.** When `loadFeatures` is called with features that have dependencies, the system shall resolve them via topological sort and execute in dependency order.
- **AC-3.** When a timeout option is provided (global or per-feature override), the system shall abort feature initialization after the specified milliseconds without blocking subsequent features.
- **AC-4.** When features have dependency relationships, `loadFeatures` shall execute them serially respecting topological order.
- **AC-5.** If a circular dependency is detected during topological sort, the system shall warn and continue without deadlocking.
- **AC-6.** If a feature's `load()` chunk rejects, the system shall warn and continue initializing remaining features.
- **AC-7.** The callback API shall match toggl-site-custom-code exactly: `onSetup(selectors) → ctx|false`, `onEach({el, index, elements, ctx})`, `onReady()`.
- **AC-8.** When `onSetup` returns `false`, the system shall abort that feature's lifecycle (skip onEach and onReady).
- **AC-9.** Invalid CSS selectors shall be caught, warned, and excluded from querySelectorAll without crashing the loader.

## Out of Scope

- Vite plugin (issue #5)
- defineFeature() implementation (issue #3 — types referenced but validator not in scope for this issue)
- HTML/declarative feature config — features are defined programmatically via FeatureMeta[]
- `enabled` field gating in loader — declared in types for descriptor completeness but filtering happens upstream (matches toggl pattern where enabled check is in the build plugin, not the runtime loader)

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Hanging feature (unresolved promise) | [from issue] | Timeout aborts it; subsequent features proceed normally |
| 2 | Circular dependency (A→B→A) | [inferred] | Warn and skip circular node; dep-wait has timeout to prevent deadlock |
| 3 | Feature selector not found in DOM | [inferred] | Skip feature, pre-seed as "ready" to unblock dependents |
| 4 | Chunk load() rejects | [inferred] | Warn + mark ready + continue with remaining features |
| 5 | Negative or zero timeout value | [inferred] | withTimeout bypasses (returns promise directly) |
| 6 | Invalid CSS selector in feature | [inferred] | Catch querySelector error, warn, exclude from validSelectors |
| 7 | Empty features array | [inferred] | No-op, resolve immediately |
| 8 | Mixed valid/invalid selectors | [discovered during implementation] | Only syntactically valid selectors passed to querySelectorAll; invalid ones excluded |
| 9 | opts.timeout vs per-feature timeout | [discovered during implementation] | effectiveTimeout = feature.timeout ?? opts.timeout; resolved at call site |
| 10 | Dependency on unknown feature ID | [discovered during implementation] | Warn and ignore the unknown dep; don't block on it |
| 11 | onSetup returns false | [discovered during implementation] | Abort feature lifecycle — skip onEach and onReady |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| TypeScript migration | AC-1 (strict types, compiles, exports correctly) |
| Toggl API parity | AC-7, AC-8 (callback signatures match, ctx threading works, false-abort works) |
| Topological sort | AC-2, AC-5 (deps resolved correctly, cycles detected and warned) |
| Configurable timeout | AC-3 (global + per-feature timeout aborts correctly) |
| Serial execution | AC-4 (respects dependency order from topo sort) |
| Error resilience | AC-5, AC-6, AC-9 (cycle warning without deadlock, chunk failure recovery, invalid selector handling) |

## Risks

| Risk | Mitigation |
|------|-----------|
| DOM dependency in tests requires jsdom | vite.config test.environment set to 'jsdom' + jsdom devDep |
| Missing defineFeature prerequisite from issue #3 | Only import types (interfaces), not defineFeature logic — types.ts is self-contained |
| Template scaffold cleanup could break existing tests | Replace barrel exports cleanly; remove example/ directory |
| API divergence from toggl source | Audited toggl-site-custom-code loader.js line-by-line; confirmed 1:1 parity |
| Dep-wait timeout changes toggl behavior | Intentional improvement: toggl deadlocks on circular deps, we timeout. Documented as known behavioral delta |

## Test Strategy

- **Environment:** vitest with jsdom for DOM access
- **Helpers:** `makeDescriptor(overrides)`, `makeMeta(overrides)` factory functions for fixture creation
- **Happy path:** single feature loads; multiple features load in priority order
- **Context passing:** onSetup returns ctx, onEach receives it
- **False abort:** onSetup returns false → onEach/onReady skipped
- **Dependency ordering:** A depends on B → B initializes first
- **Timeout:** feature with long promise aborts after timeout, next feature proceeds
- **Dep timeout unblocks dependents:** timed-out feature still marks as ready
- **Chunk failure:** load() rejects → warning emitted, other features still run
- **Cycle detection:** circular deps produce warnings, no infinite loop/deadlock
- **Edge cases:** empty array, no DOM matches, global features always load, invalid selectors
- **Logging:** console.warn spy to verify messages; logging:false suppresses all warnings
- **Coverage:** 24 tests covering full branch coverage on loader.ts
