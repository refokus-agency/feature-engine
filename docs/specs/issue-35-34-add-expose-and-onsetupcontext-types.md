---
issue_number: 35
issue_title: "[#34] Add `expose` and `OnSetupContext` types"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "feat/35-add-expose-and-onsetupcontext-types"
base_branch: "feat/34-feat-add-expose-field-for-dependency-context-sharing"
epic: 34
created_at: "2026-05-29T08:27:15-03:00"
updated_at: "2026-05-29T09:10:00-03:00"
---

# Implementation Plan: #35 — [#34] Add `expose` and `OnSetupContext` types

This issue is the **types-only foundation** of epic #34 (`feat: add expose field for
dependency context sharing`). It adds the public type surface; the loader accumulation of
exposed contexts, `defineFeature` runtime validation, runtime pass-through of `expose`, and
documentation are sibling sub-issues and are explicitly **out of scope** here.

**Branch:** `feat/35-add-expose-and-onsetupcontext-types`, based on the epic branch
`feat/34-feat-add-expose-field-for-dependency-context-sharing` (currently at the same commit
as `main`, `f0c702a`).

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/types.ts` | Add `OnSetupContext` interface; add `expose?: (ctx: any) => unknown` to `FeatureDescriptorInput` and `FeatureDescriptor`; add required `context: OnSetupContext` 2nd parameter to `OnSetupFn`. **(`expose` param is `any`, not `unknown` — see Step 8 / review deviation.)** |
| 2 | modify | `src/index.ts` | Add `OnSetupContext` to the explicit `export type { … }` allowlist |
| 3 | modify | `src/loader.ts` | One-line call-site update: pass a context object to `feature.onSetup` so the new required 2nd param type-checks (`initFeature`, ~line 95) |
| 4 | modify | `src/__tests__/define-feature.test.ts` | Add compile-time assertion tests mirroring AC-1..AC-5 |
| 5 | modify | `package.json` | **[added during review]** Point `check-types` at the existing `tsconfig.eslint.json` (the repo's "includes tests" tooling config from PR #18) so CI (`pr-ci.yml` → typecheck) and `prepublishOnly` enforce the test type assertions. No new config file — reuses the established two-config pattern. |
| 7 | modify | `src/__tests__/loader.test.ts` | **[added during review]** Fix a pre-existing latent type error (line ~943: mock typed `Promise<unknown>` assigned to `onEach`'s `Promise<void>`) surfaced once tests were brought under `check-types`. Annotated `new Promise<void>`. |

## Codebase Context

- **`src/types.ts`** is the single source of truth for public types. JSDoc style is single-line
  `/** … */` above each declaration; no `@param` tags on interface fields. Match this style.
- **`src/index.ts`** uses an **explicit named** `export type { … } from './types.ts'` allowlist
  (not a wildcard) — `OnSetupContext` must be added by hand or it won't be public.
- **`src/define-feature.ts`** builds its frozen descriptor via an explicit allowlist
  `Object.freeze({ … })` (field-by-field, not spread). Runtime pass-through of `expose` would
  require editing that block — **deferred to a sibling issue**, not done here.
- **`src/loader.ts` `initFeature`** calls `ctx = await feature.onSetup(selectors)` (single arg).
  With a required 2nd param this would fail `check-types`, so this call site gets the minimal
  one-line update (pass `{ deps: {} }` placeholder — real deps population is a sibling issue).
- **`src/vite/parse-feature-file.ts`** only extracts literal `METADATA_KEYS`. `expose` is a
  function and is correctly ignored by the AST parser — **no change needed**.
- **Conventions (CLAUDE.md):** explicit `.ts` import extensions; types live in `src/types.ts`;
  two package entry points (`.` and `./vite`) — new runtime types belong to `.` via `index.ts`;
  tests are vitest + jsdom with globals enabled (test files still import `describe`/`it`/`expect`).

## Steps

> **Status:** Steps 1–7 implemented and verified (build gate green). Steps 8–10 were added
> during `/implement-review` to resolve two P1 findings and are also complete. See
> **Review Deviations** below.

1. **Add `OnSetupContext` interface to `src/types.ts`.** Place it near `OnSetupFn`, with
   single-line JSDoc. Shape: `{ deps: Record<string, unknown> }`.
   **Done when:** `OnSetupContext` is declared and exported from `src/types.ts`.

2. **Update `OnSetupFn` in `src/types.ts`** to add a required second parameter:
   `(selectors: string[], context: OnSetupContext) => unknown | false | Promise<unknown | false>`.
   **Done when:** `OnSetupFn` has the `context: OnSetupContext` parameter and the file still
   compiles in isolation.

3. **Add `expose?: (ctx: unknown) => unknown`** to both `FeatureDescriptor` and
   `FeatureDescriptorInput` in `src/types.ts`, with single-line JSDoc describing it as the
   public-API projection called after the lifecycle completes.
   **Done when:** both interfaces declare the optional `expose` field.

4. **Export `OnSetupContext` from `src/index.ts`** by adding it (alphabetically) to the
   `export type { … } from './types.ts'` allowlist.
   **Done when:** `OnSetupContext` appears in the `index.ts` type re-export list.

5. **Update the loader call site in `src/loader.ts` `initFeature`.** Change
   `ctx = await feature.onSetup(selectors)` to pass a context object, e.g.
   `const deps: Record<string, unknown> = {}; ctx = await feature.onSetup(selectors, { deps });`.
   This is the minimal change to keep the new required 2nd param type-checking; real deps
   population stays in the loader-wiring sibling issue.
   **Done when:** `npm run check-types` passes with no errors in `loader.ts`.

6. **Add compile-time assertion tests** to `src/__tests__/define-feature.test.ts` covering
   AC-1..AC-5 (see Test Strategy). Use existing style: `describe`/`it`, explicit `.ts` imports,
   `import type` for type-only imports.
   **Done when:** new tests exist and `npm test` passes.

7. **Verify the full build gate.**
   **Done when:** `npm run check-types`, `npm test`, and `npm run build` all pass.

8. **[review] Widen the `expose` parameter from `unknown` to `any`** in both `FeatureDescriptor`
   and `FeatureDescriptorInput`. Under `--strictFunctionTypes`, `expose?: (ctx: unknown) => unknown`
   rejects the primary use case `expose: (ctx: ConcreteType) => …` with TS2322 (contravariant
   parameter check). `any` lets callers annotate `ctx` with the concrete `onSetup` return type;
   widening `unknown`→`any` is a non-breaking change. Added a regression-guard test.
   **Done when:** `expose: (ctx: { token: string }) => ctx.token` compiles and the guard test passes.

9. **[review] Make the compile-time assertion tests an enforced gate.** Repoint the `check-types`
   script to `-p tsconfig.eslint.json` (the repo's pre-existing "includes tests" tooling config,
   added in PR #18 — extends `tsconfig.json`, excludes only `node_modules`). Previously `tsconfig.json`
   excluded `src/**/__tests__/**`, so neither `check-types` nor `vitest run` (no `typecheck`) ever
   type-checked the assertions — the test strategy rested on an unenforced claim. (A fresh
   `tsconfig.test.json` was briefly created, then dropped during review as a duplicate of
   `tsconfig.eslint.json`.)
   **Done when:** `npm run check-types` type-checks `src/__tests__/**` and CI/`prepublishOnly` inherit it.

10. **[review] Fix the latent `onEach` mock type error surfaced by Step 9.** `loader.test.ts` had a
    mock typed `Promise<unknown>` assigned to `onEach` (`Promise<void>`), previously hidden because
    tests were excluded from `check-types`. Annotate `new Promise<void>(…)`.
    **Done when:** `npm run check-types` is green with tests included.

## Interfaces

- **`OnSetupContext`** (new): `{ deps: Record<string, unknown> }` — the context object passed
  as the second argument to `onSetup`. `deps` maps a declared dependency's feature id to its
  exposed value (populated by the loader in a sibling issue).
- **`OnSetupFn`** (changed): gains required second parameter `context: OnSetupContext`.
- **`FeatureDescriptor` / `FeatureDescriptorInput`** (changed): gain
  `expose?: (ctx: any) => unknown`. **(Param is `any`, not `unknown` — chosen during review so
  callers can annotate `ctx` with the concrete `onSetup` return type; see Review Deviations.)**

## Function Design

No new functions. This issue is type-level edits to `types.ts` + `index.ts`, plus a single
call-site edit in `loader.ts`. No function combines orchestration with lifecycle management.

## Acceptance Criteria (EARS)

- **AC-1.** The package shall expose an `expose?: (ctx: any) => unknown` field on both
  `FeatureDescriptorInput` and `FeatureDescriptor`, such that
  `defineFeature({ expose: (ctx) => ({ … }) })` compiles without error — **and a caller may
  annotate the param with a concrete type** (`expose: (ctx: { token: string }) => ctx.token`)
  without a TS2322 contravariance error. (Signature finalized as `any` during review.)
- **AC-2.** When a feature declares a single-argument `onSetup(selectors)`, the type system
  shall accept it (backwards compatible — no existing single-arg callback breaks).
- **AC-3.** When a feature declares `onSetup(selectors, { deps })`, the type system shall accept
  it with `deps` typed as `Record<string, unknown>`.
- **AC-4.** The package shall export `OnSetupContext` (and the updated `OnSetupFn`) from the main
  entry point `@refokus-agency/feature-engine`.
- **AC-5.** If `expose` returns `false` or `null`, the type system shall still accept it (not
  treated as an opt-out at the type level).

## Out of Scope

- Loader accumulation of exposed contexts into a `Map<string, unknown>` and populating the real
  `deps` record (loader-wiring sibling issue).
- `defineFeature` runtime validation that `expose` is a function if provided (sibling issue).
- Adding `expose` to the `Object.freeze({ … })` runtime pass-through in `define-feature.ts`
  (sibling issue).
- Documentation of the "return functions over snapshots" convention (sibling issue).
- Any change to `src/vite/parse-feature-file.ts` (functions are not static metadata).

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | `expose` returns `false` or `null` | [from issue] | Type permits it; no opt-out semantics at the type level (AC-5). |
| 2 | Single-arg legacy `onSetup(selectors)` | [from issue] | Structural typing accepts a fewer-param function assigned to the 2-param `OnSetupFn` (AC-2); verified via tsc. |
| 3 | `expose` present with no `onSetup` | [from epic] | Type permits; `ctx` is `unknown`, no type-level coupling to `onSetup`. |
| 4 | `global: true` feature with `expose` | [from epic] | No type restriction; `expose` allowed alongside `global` (runtime behavior is a sibling issue). |
| 5 | Loader's existing 1-arg `onSetup` call breaks build | [inferred] | Resolved by the one-line call-site update (Step 5); guarded by `npm run check-types`. |
| 6 | Typed `expose` param rejected under `--strictFunctionTypes` (`(ctx: T) => …` not assignable to `(ctx: unknown) => …`) | [discovered during implementation] | Param typed `any` (Step 8); regression-guard test added. |
| 7 | Compile-time assertion tests never type-checked (`tsconfig.json` excluded tests; `vitest run` has no `typecheck`) | [discovered during implementation] | Repoint `check-types -p tsconfig.eslint.json` (existing config) so the assertions are enforced in CI (Step 9). |
| 8 | Pre-existing `onEach` mock typed `Promise<unknown>` fails once tests enter `check-types` | [discovered during implementation] | Annotated `new Promise<void>` in `loader.test.ts` (Step 10). |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| `expose` field | AC-1, AC-5 |
| `OnSetupContext` + 2nd arg | AC-2, AC-3 |
| Public export | AC-4 |
| Build integrity | `npm run check-types` + `npm test` + `npm run build` all pass |

## Risks

- **Semver-major risk** if the `expose` signature is revised after release → mitigate by shipping
  within epic #34 before any release tags it; the signature matches the epic's agreed design.
- **Option B nudges one line of loader scope** (the `onSetup` call site) → mitigate: it is the
  minimal edit required to keep the build green; real `deps` population stays in the sibling
  loader-wiring issue. The placeholder `{ deps: {} }` is intentionally empty.
- **No existing type-level test file** → mitigate by adding compile-time assertion tests to
  `define-feature.test.ts` and relying on `check-types` in CI as the authoritative gate.

## Test Strategy

- **Decision (Option B, user-approved):** `OnSetupFn`'s second parameter is **required**
  (`context: OnSetupContext`), and the loader call site is updated to pass `{ deps: {} }`. This
  was verified against real `tsc --strict`: it satisfies AC-2 (single-arg still assignable),
  AC-3 (direct `{ deps }` destructuring compiles), and keeps `check-types` green. The optional
  `context?` alternative was rejected because the literal AC-3 destructuring form would not
  compile under it.
- Add compile-time assertion tests to `src/__tests__/define-feature.test.ts` that exercise valid
  `defineFeature({ … })` shapes which must compile:
  - `expose: (ctx) => ({ … })`, plus `expose: () => false` and `expose: () => null` (AC-1, AC-5).
  - `onSetup(selectors)` single-arg (AC-2).
  - `onSetup(selectors, { deps })` with typed `deps` access (AC-3).
  - A type-only import of `OnSetupContext` from the package index to assert the export (AC-4).
- **[review] The test assertions are now genuinely gated.** `check-types` runs against
  `tsconfig.eslint.json` (includes `src/__tests__/**`), so a future regression in any AC-2/AC-3/AC-5
  shape fails CI. Two extra assertions were added: a typed-`expose`-param regression guard (AC-1)
  and an `OnSetupFn` import+use from the package entry point (AC-4 completeness).
- `npm run check-types` (tsc `--strict --noEmit`, now `-p tsconfig.eslint.json`) is the authoritative type gate — must pass.
- `npm test` (vitest + jsdom) and `npm run build` (tsc) must stay green.
- Style: match existing tests — vitest `describe`/`it`/`expect`, explicit `.ts` import
  extensions, `import type { … }` for type-only imports.

## Review Deviations (post-implementation)

Recorded during `/implement-review`. Two P1 findings (from the code-attacker, independently
verified against the repo's own `tsc`) drove changes beyond the originally approved plan:

1. **`expose` param: `unknown` → `any`** (`src/types.ts`). The approved signature
   `(ctx: unknown) => unknown` rejected the intended use case `expose: (ctx: ConcreteType) => …`
   under `--strictFunctionTypes` (contravariant param check, TS2322). Widened to `any`
   (non-breaking). Added a regression-guard test. This is a deliberate divergence from the plan's
   original literal signature.

2. **Compile-time tests were enforced by no gate.** `tsconfig.json` excluded
   `src/**/__tests__/**` and `vitest run` does no type-checking, so the entire compile-time test
   strategy was unverified. Repointed `check-types` at the existing `tsconfig.eslint.json` (the
   repo's "includes tests" config from PR #18; a duplicate `tsconfig.test.json` was created then
   dropped). This
   surfaced a pre-existing latent type error in `loader.test.ts` (mock `Promise<unknown>` →
   `onEach`'s `Promise<void>`), fixed by `new Promise<void>`.

**Not addressed (out of scope, deferred to sibling issues):**
- AC-1 runtime assertion of `result.expose` and the `expose?` (`| undefined`) vs `| null`
  nullability inconsistency both require wiring `expose` through the `Object.freeze({ … })`
  passthrough in `define-feature.ts` — that is the sibling runtime issue, not this types-only one.
- The shared `noop` test stub was intentionally left untyped: annotating it as `OnSetupFn` (2 params)
  would make it non-assignable where it is reused as `onEach`/`onReady`.
