---
issue_number: 37
issue_title: "[#34] Validate `expose` in `defineFeature`"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/37-validate-expose-in-definefeature"
base_branch: "feat/36-implement-expose-deps-in-loader"
epic: 34
created_at: "2026-05-29T11:47:05-03:00"
updated_at: "2026-05-29T12:05:00-03:00"
---

# Implementation Plan: #37 — [#34] Validate `expose` in `defineFeature`

Validation sub-issue of epic #34. Adds a `defineFeature` guard that rejects a non-function
`expose`, mirroring the existing `onSetup`/`onEach`/`onReady` validation. The `expose` type (#35)
and the loader runtime + freeze pass-through (#36) are already done — this issue adds **only**
input validation.

**Branch:** `feat/37-validate-expose-in-definefeature`, **stacked on `feat/36-...`** (PR #41, open)
because the guard sits in the same `defineFeature` validation sequence whose `Object.freeze` block
#36 edited. Cannot base on `main`/`feat/34` until #35 and #36 merge.

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/define-feature.ts` | Add an `expose` type-guard after the `onReady` validation: throw `[defineFeature] expose must be a function` for a truthy non-function `expose`. **[review]** Also normalize the freeze value to `expose: descriptor.expose \|\| null` (was `descriptor.expose`). |
| 2 | modify | `src/__tests__/define-feature.test.ts` | Add the non-function-`expose` throw test (AC-1). **[review]** The positive AC-2/AC-3 cases are covered by the existing `expose + OnSetupContext types` block (no duplicates added there); updated its absent-case assertion to `toBeNull()`. |
| 3 | modify | `src/types.ts` | **[review, P2-1]** Normalize `expose` to the `\| null` convention of the other hooks: `FeatureDescriptor.expose: ((ctx: any) => unknown) \| null` (required, nullable) and `FeatureDescriptorInput.expose?: ((ctx: any) => unknown) \| null`. |
| 4 | modify | `src/__tests__/loader.test.ts` | **[review, P2-1]** `makeDescriptor` helper now sets `expose: null` (required field on `FeatureDescriptor`). |
| 5 | modify | `src/__tests__/loader.smoke.test.ts` | **[review, P2-1]** Same `makeDescriptor` `expose: null` addition. |
| 6 | modify | `src/__tests__/loader.bench.ts` | **[review, P2-1]** Same `makeDescriptor` `expose: null` addition. |

## Codebase Context

- **`src/define-feature.ts`** validates inputs (lines 40-107) with a consistent guard pattern:
  `if (descriptor.X && typeof descriptor.X !== 'function') { throw new Error('[defineFeature] X must be a function'); }`
  — see `onReady` at lines 80-82. The new `expose` guard mirrors this exactly and is placed right
  after the `onReady` check, **before** the `Object.freeze` (lines ~109-121).
- The `expose` freeze pass-through (`expose: descriptor.expose`) was added in **#36**. This issue
  adds validation only; it does not touch the freeze or the type.
- **`src/__tests__/define-feature.test.ts`** has a `describe('validation errors')` block; the throw
  pattern is `expect(() => defineFeature(minimal({ X: bad }))).toThrow('[defineFeature] ...')`. The
  `minimal()` helper supplies `id`/`selectors`/`priority`/`onSetup`, so a descriptor with only a bad
  `expose` is otherwise valid and reaches the `expose` guard.
- **Conventions:** explicit `.ts` imports; error messages prefixed `[defineFeature]`; vitest + jsdom;
  `check-types` runs `-p tsconfig.eslint.json` (includes tests).

## Steps

1. **Add the `expose` guard** in `src/define-feature.ts` immediately after the `onReady` check
   (after line 82):
   `if (descriptor.expose && typeof descriptor.expose !== 'function') { throw new Error('[defineFeature] expose must be a function'); }`
   **Done when:** a truthy non-function `expose` throws `[defineFeature] expose must be a function`,
   and the guard sits before the `Object.freeze`.

2. **Add validation tests** to `src/__tests__/define-feature.test.ts` (in the `validation errors`
   describe): (a) non-function `expose` (string) throws the message; (b) a function `expose` passes;
   (c) absent `expose` passes. (b)/(c) may reuse/extend the #36 AC-8 pass-through tests.
   **Done when:** the tests exist and `npm test` passes.

3. **Build gate.**
   **Done when:** `npm run check-types`, `npm test`, and `npm run build` all pass.

4. **[review, P2-1] Normalize `expose` to `| null`.** Update both `types.ts` interfaces, set the
   freeze value to `descriptor.expose || null`, add `expose: null` to the three `makeDescriptor`
   test helpers (`loader.test.ts`, `loader.smoke.test.ts`, `loader.bench.ts`), and update the
   absent-case assertion to `toBeNull()`.
   **Done when:** `defineFeature(minimal()).expose` is `null` and `check-types` passes with `expose`
   required-nullable on `FeatureDescriptor`.

5. **[review, P2-2] Dedup the positive tests.** The `validation errors` block keeps only the
   non-function throw test (AC-1); the positive function/absent cases (AC-2/AC-3) are covered by the
   existing `expose + OnSetupContext types` block — no duplicates.
   **Done when:** no redundant positive `expose` tests remain in `validation errors`; AC-2/AC-3 stay
   covered by the existing block.

## Interfaces

- **[review, P2-1]** `expose` normalized to the `| null` convention shared by the other hooks:
  - `FeatureDescriptor.expose: ((ctx: any) => unknown) | null` — required + nullable (was optional `?`).
  - `FeatureDescriptorInput.expose?: ((ctx: any) => unknown) | null` — optional + nullable.
  - `defineFeature` now returns `expose: null` (not `undefined`) when absent. Loader guards
    (`if (feature.expose)` / `if (descriptor.expose)`) are unaffected (`null` is falsy).

## Function Design

- No new functions. A single validation guard is added to the existing `defineFeature` validation
  sequence; it does not mix concerns (pure input validation, consistent with siblings).

## Acceptance Criteria (EARS)

- **AC-1.** If `expose` is provided and is not a function, then `defineFeature` shall throw an error
  whose message is `[defineFeature] expose must be a function`. [from issue]
- **AC-2.** When `expose` is provided as a function, `defineFeature` shall pass validation and return
  the frozen descriptor carrying that `expose`. [from issue]
- **AC-3.** When `expose` is not provided, `defineFeature` shall pass validation (the field is
  optional). [from issue]

## Out of Scope

- Loader runtime behavior of `expose` (#36, delivered).
- Integration tests `defineFeature` → loader (#38).
- ~~Any change to the `expose` type signature~~ — **superseded:** the review-driven P2-1 fix
  normalized `expose` to `| null` (see Review Deviations). The `expose` *parameter* type
  (`(ctx: any) => unknown`) is unchanged.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | `expose: 'not a function'` (truthy non-function) | [from issue] | Guard throws `[defineFeature] expose must be a function` (AC-1). |
| 2 | `expose: (ctx) => ctx` (arrow / async / regular function) | [from issue] | `typeof === 'function'` → passes (AC-2). |
| 3 | `expose` absent (`undefined`) | [from issue] | `descriptor.expose` falsy → guard skipped → passes (AC-3). |
| 4 | `expose: null` / other falsy non-function (`0`, `''`, `false`) | [inferred] | `descriptor.expose &&` short-circuits → no throw; treated as "no expose", consistent with the existing `onReady`/`onEach` guard convention. Documented, not an error. |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| `expose` validation | AC-1, AC-2, AC-3 |
| Build integrity | `npm run check-types` + `npm test` + `npm run build` all pass |

## Risks

- **Stacked on `feat/36`** (unmerged, PR #41): #37's guard lives in the same validation sequence
  whose freeze block #36 edited → minor merge-order coupling. Mitigate: keep base = `feat/36`; merge
  order #40 → #41 → #37.
- **Falsy-but-non-function `expose`** (`null`/`0`/`''`) is silently treated as "no expose" rather
  than rejected. Mitigate: matches the repo's existing `X && typeof` convention (edge 4); user
  approved this behavior over strict rejection.
- **[review] `expose` type normalized to `| null`** touches #35's public type surface (`types.ts`),
  folded into #37 like the freeze pass-through was folded into #36. Safe pre-release within the epic
  (all sub-issues unmerged/stacked); no consumer relies on the old `undefined`-when-absent shape yet.

## Test Strategy

- `src/__tests__/define-feature.test.ts`, `describe('validation errors')` style:
  `expect(() => defineFeature(minimal({ expose: 'x' as unknown as FeatureDescriptorInput['expose'] }))).toThrow('[defineFeature] expose must be a function')`.
- Function-`expose` passes (the #36 AC-8 pass-through test) and absent-`expose` → `null` (#36 block,
  assertion updated to `toBeNull()`).
- Gate: `npm run check-types` (`-p tsconfig.eslint.json`, includes tests) + `npm test` + `npm run build`.

## Review Deviations (post-implementation)

Applied during `/implement-review` from two P2 findings (user requested both fixed):

1. **P2-1 — `expose` normalization.** `expose` was the only descriptor field not normalized to
   `null` (the freeze passed `descriptor.expose` directly, leaving `undefined` when absent — out of
   step with `onSetup`/`onEach`/`onReady` which use `|| null`). Normalized: `types.ts` (`expose` →
   `((ctx: any) => unknown) | null` on `FeatureDescriptor`, optional+nullable on the input), freeze
   `|| null`, and `expose: null` added to the three `makeDescriptor` test helpers. Absent-case
   assertion → `toBeNull()`. Loader behavior unchanged (`null` is falsy under the existing guards).
2. **P2-2 — test dedup/organization.** The two positive `expose` tests added in the first pass lived
   in the `validation errors` block and duplicated the existing `expose + OnSetupContext types`
   tests. Removed; the `validation errors` block keeps only the AC-1 throw test.

**Result:** 4 extra files vs. the original 2-file plan; `npm test` 293 (net −2 after dedup);
check-types + build green.
