---
issue_number: 6
issue_title: "Define exported types (FeatureDescriptor, FeatureMeta, etc.)"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/6-define-exported-types"
created_at: "2026-04-27T00:00:00Z"
---

# Implementation Plan: #6 — Define exported types (FeatureDescriptor, FeatureMeta, etc.)

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | src/types.ts | Extract callback types, add FeatureEachContext, add JSDoc to all exported types |
| 2 | modify | src/index.ts | Re-export new named callback types and FeatureEachContext |
| 3 | modify | src/vite/index.ts | Add JSDoc to FeatureMetadataPluginOptions and ParsedFeatureMeta |

## Codebase Context

- `src/types.ts` is the single source of truth for shared types — all new types go here
- Vite-specific types stay in `src/vite/` and are exported via the `./vite` subpath
- Imports use explicit `.ts` extensions (rewritten by tsc via `rewriteRelativeImportExtensions`)
- `FeatureDescriptor` uses `readonly` arrays; Input/Meta shapes use plain `string[]`

## Steps

1. **Extract named callback types from FeatureDescriptor inline signatures** → `src/types.ts`
   - Define `FeatureEachContext` interface: `{ el: Element; index: number; elements: NodeListOf<Element>; ctx: unknown }`
   - Define `OnSetupFn` type: `(selectors: string[]) => unknown | false | Promise<unknown | false>`
   - Define `OnEachFn` type: `(ctx: FeatureEachContext) => void | Promise<void>`
   - Define `OnReadyFn` type: `() => void | Promise<void>`
   - Refactor `FeatureDescriptor` and `FeatureDescriptorInput` to reference these named types instead of inline signatures
   - **Done when:** `OnSetupFn`, `OnEachFn`, `OnReadyFn`, `FeatureEachContext` are defined as named types and `FeatureDescriptor`/`FeatureDescriptorInput` reference them

2. **Add JSDoc to all exported types in src/types.ts** → `src/types.ts`
   - Add one-line `/** */` JSDoc to every exported interface and type alias
   - **Done when:** every exported interface/type in `src/types.ts` has a JSDoc comment

3. **Add JSDoc to vite-specific exported types** → `src/vite/index.ts`, `src/vite/parse-feature-file.ts`
   - Add JSDoc to `FeatureMetadataPluginOptions` and `ParsedFeatureMeta`
   - **Done when:** `FeatureMetadataPluginOptions` and `ParsedFeatureMeta` have JSDoc

4. **Re-export new types from main entry point** → `src/index.ts`
   - Add `OnSetupFn`, `OnEachFn`, `OnReadyFn`, `FeatureEachContext` to the `export type` statement
   - **Done when:** all four new types appear in the `export type` statement in `src/index.ts`

## Interfaces

- **FeatureDescriptor**: Frozen, normalized runtime descriptor returned by `defineFeature()`. Fields: `id`, `selectors` (readonly), `priority`, `global`, `dependencies` (readonly), `enabled`, `timeout`, `onSetup`, `onEach`, `onReady`. Existing — refactored to use named callback types.
- **FeatureDescriptorInput**: User-facing input shape for `defineFeature()` with optional fields. Existing — refactored to use named callback types.
- **FeatureMeta**: Static metadata + lazy loader used by `loadFeatures()`. Fields: `id`, `selectors`, `priority`, `global`, `dependencies`, `timeout`, `load`. Existing — unchanged.
- **LoaderOptions**: Loader configuration. Fields: `timeout`, `logging`. Existing — unchanged.
- **FeatureEachContext**: Context object passed to `onEach` callbacks. Fields: `el: Element`, `index: number`, `elements: NodeListOf<Element>`, `ctx: unknown`. New.
- **OnSetupFn**: `(selectors: string[]) => unknown | false | Promise<unknown | false>`. New.
- **OnEachFn**: `(ctx: FeatureEachContext) => void | Promise<void>`. New.
- **OnReadyFn**: `() => void | Promise<void>`. New.

## Function Design

No new functions — this issue is types-only.

## Acceptance Criteria (EARS)

- **AC-1.** The package **shall** export types `FeatureDescriptor`, `FeatureMeta`, `LoaderOptions` from the main entry point. [from issue]
- **AC-2.** The package **shall** export `FeatureDescriptorInput` as a public type for consumers calling `defineFeature()`. [inferred]
- **AC-3.** When a consumer imports from `@refokus-agency/feature-engine`, type declarations (`.d.ts`) **shall** be resolved by both TypeScript and editors. [from issue]
- **AC-4.** When a consumer imports from `@refokus-agency/feature-engine/vite`, `FeatureMetadataPluginOptions` and `ParsedFeatureMeta` **shall** be available. [inferred]
- **AC-5.** The package **shall** export named callback types (`OnSetupFn`, `OnEachFn`, `OnReadyFn`) and `FeatureEachContext` as first-class citizens. [inferred]
- **AC-6.** All exported types **shall** have JSDoc documentation describing their purpose. [inferred]

## Out of Scope

- Unit tests for types (covered by issue #7)
- Runtime validation of types — these are compile-time only
- Moving `ParsedFeatureMeta` to `src/types.ts` — it stays vite-specific

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|---------|
| 1 | Extracting callback types changes the public API surface | [inferred] | Use exact same signatures; types are structural, no runtime change |
| 2 | Consumers using inline types break after refactor | [inferred] | Named types are structurally identical — no breaking change for TS consumers |
| 3 | JSDoc on type aliases vs interfaces | [inferred] | Use `/** */` on both; tsc emits JSDoc in `.d.ts` for both forms |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Core type exports | AC-1, AC-2, AC-3 |
| Vite type exports | AC-4 |
| Named callback types | AC-5 |
| JSDoc documentation | AC-6 |

## Risks

| Risk | Mitigation |
|------|------------|
| Refactoring inline types to named types could introduce subtle signature mismatches | Run `tsc --noEmit` after changes to verify no type errors |

## Test Strategy

- Run `tsc --noEmit` to verify all types compile correctly
- Run existing test suite to verify no regressions
- Verify `.d.ts` output includes all new types with JSDoc
