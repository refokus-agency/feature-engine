---
issue_number: 3
issue_title: "Migrate defineFeature() to TypeScript"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/3-migrate-define-feature-to-typescript"
base_branch: "feat/create-refokusfeature-engine-as-reusable-npm-package"
created_at: "2026-04-24T00:00:00Z"
---

# Implementation Plan: #3 — Migrate defineFeature() to TypeScript

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `src/define-feature.ts` | Replace stub with full validation + freeze logic |
| 2 | create | `src/__tests__/define-feature.test.ts` | Tests for all validation rules, defaults, freeze behavior |

## Codebase Context

- `src/types.ts` — `FeatureDescriptor` and `FeatureDescriptorInput` already defined on base branch, verified against original JS source
- `src/index.ts` — Already re-exports `defineFeature` from `./define-feature.ts`
- ESM module system (`"type": "module"`) with `.ts` import extensions (`rewriteRelativeImportExtensions: true`)
- Strict TypeScript via `@total-typescript/tsconfig` (strict: true, noUncheckedIndexedAccess, etc.)
- `DOM` lib available in tsconfig for `Element`, `NodeListOf<Element>`
- Vitest with `jsdom` environment, `globals: true`, tests at `src/**/__tests__/*.test.ts`
- Error messages prefixed with `[defineFeature]` (matching original JS source at `~/Github/webflow-custom-code-tmp/src/lib/feature.js`)
- Original plan: `~/Github/webflow-custom-code-tmp/docs/plans/dom-driven-code-splitting.md` — defines the same validation rules, freeze behavior, and edge cases

## Steps

### Step 1: Merge base branch into worktree

Merge `feat/create-refokusfeature-engine-as-reusable-npm-package` into the worktree so all base branch files (`src/types.ts`, `src/define-feature.ts` stub, updated configs) become available.

**Done when:** `src/define-feature.ts` and `src/types.ts` exist in the worktree, and `git log` shows base branch commits.

### Step 2: Implement defineFeature()

Replace the stub in `src/define-feature.ts` with the full implementation. Port all 10 validation rules from the original JS source, add TypeScript types, normalize defaults, return `Object.freeze` with frozen inner arrays.

Validations to implement (in order):
1. `id` required, must be non-empty string
2. `selectors` must be an array
3. `priority` must be a number
4. At least one of `onSetup` or `onEach` must be a function
5. `global: true` with `onEach` → throw (global features have no selectors to match)
6. `onSetup` truthy but not function → throw
7. `onEach` truthy but not function → throw
8. `onReady` truthy but not function → throw
9. `dependencies` if provided must be `string[]`
10. `enabled` if provided must be boolean
11. `timeout` if provided and not null must be positive number

Normalized defaults: `global → false`, `dependencies → deduped + frozen`, `enabled → true`, `timeout → null`, `hooks → null`.

**Done when:** `npx tsc --noEmit` passes with no errors.

### Step 3: Create test file

Create `src/__tests__/define-feature.test.ts` covering:
- Valid descriptors: minimal (onSetup only), minimal (onEach only), full with all fields
- Each validation error path (11 cases)
- Default normalization: global, dependencies, enabled, timeout, hooks
- Freeze behavior: outer object frozen, selectors array frozen, dependencies array frozen
- Edge cases: empty string id, null selectors, global+onSetup valid, duplicate dependencies deduped, timeout 0/-1 rejected, truthy non-function hooks, explicit undefined enabled

**Done when:** `npx vitest run src/__tests__/define-feature.test.ts` passes with all tests green.

### Step 4: Full verification

Run the full test suite and type checker to ensure no regressions.

**Done when:** `npm test` and `npm run check-types` both exit 0.

## Interfaces

Already defined in `src/types.ts` on the base branch:

- **FeatureDescriptorInput**: Input type with optional fields — `id: string`, `selectors: string[]`, `priority: number`, plus optional `global?`, `dependencies?`, `enabled?`, `timeout?`, `onSetup?`, `onEach?`, `onReady?`
- **FeatureDescriptor**: Fully resolved output — all fields required, hooks nullable (`| null`), `timeout: number | null`

No new types needed.

## Function Design

- `src/define-feature.ts`: **`defineFeature(descriptor: FeatureDescriptorInput): Readonly<FeatureDescriptor>`** — single function, single concern: validate input fields in order, normalize defaults, return `Object.freeze()` with frozen inner arrays (`selectors`, `dependencies`). ~40 lines of sequential validation. No decomposition needed.

## Acceptance Criteria (EARS)

- **AC-1.** The system shall export a `defineFeature(descriptor: FeatureDescriptorInput): Readonly<FeatureDescriptor>` function from `src/define-feature.ts`. `[from issue]`
- **AC-2.** When `defineFeature` is called with a descriptor missing `id` or with a non-string `id`, the system shall throw `[defineFeature] id is required and must be a string`. `[from issue]`
- **AC-3.** When `defineFeature` is called with a descriptor where `selectors` is not an array, the system shall throw `[defineFeature] selectors must be an array`. `[from issue]`
- **AC-4.** When `defineFeature` is called with valid input, the returned descriptor shall be frozen via `Object.freeze` (outer object, selectors array, and dependencies array). `[from issue]`
- **AC-5.** The lifecycle hooks shall be typed per `FeatureDescriptor` signatures: `onSetup: ((selectors: string[]) => unknown | false | Promise<unknown | false>) | null`, `onEach: ((ctx: {...}) => void | Promise<void>) | null`, `onReady: (() => void | Promise<void>) | null`. `[from issue]`
- **AC-6.** When `priority` is not a number, the system shall throw `[defineFeature] priority is required and must be a number`. `[inferred]`
- **AC-7.** When neither `onSetup` nor `onEach` are functions, the system shall throw `[defineFeature] at least one of onSetup or onEach is required`. `[inferred]`
- **AC-8.** When `global` is `true` and `onEach` is a function, the system shall throw `[defineFeature] global features cannot use onEach (no selectors to match)`. `[inferred]`
- **AC-9.** When `onSetup`, `onEach`, or `onReady` are truthy but not functions, the system shall throw the respective error. `[inferred]`
- **AC-10.** When `dependencies` is provided but is not an array of strings, the system shall throw `[defineFeature] dependencies must be an array of strings`. `[inferred]`
- **AC-11.** When `enabled` is provided but is not a boolean, the system shall throw `[defineFeature] enabled must be a boolean`. `[inferred]`
- **AC-12.** When `timeout` is provided, is not null/undefined, and is not a positive number, the system shall throw `[defineFeature] timeout must be a positive number (ms)`. `[inferred]`
- **AC-13.** The returned frozen descriptor shall normalize defaults: `global` defaults to `false`, `dependencies` deduped via `new Set()` and frozen, `enabled` defaults to `true` (`enabled !== false`), `timeout` defaults to `null`, optional hooks default to `null`. `[inferred]`

## Out of Scope

- Changes to `src/types.ts` — types are already correct on the base branch
- Changes to `src/index.ts` — already re-exports `defineFeature`
- Implementation of `loadFeatures()` (issue #4)
- Implementation of the Vite plugin (issue #5)
- Runtime `enabled` field behavior (that's the loader's concern, issue #4)

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | `id` is empty string `""` | [from issue] | Throws — `!descriptor.id` catches falsy strings |
| 2 | `selectors` is `null` or `undefined` | [inferred] | Throws — `Array.isArray` returns false |
| 3 | `global: true` with only `onSetup` (no `onEach`) | [inferred] | Valid — global features run `onSetup` only |
| 4 | `dependencies` with duplicate entries | [inferred] | Deduped via `new Set()` before freezing |
| 5 | `timeout: 0` or `timeout: -1` | [from issue] | Throws — must be positive number (`> 0`) |
| 6 | `onSetup` is a truthy non-function (e.g. `true`, `"fn"`) | [inferred] | Throws — `descriptor.onSetup && typeof !== 'function'` catches this |
| 7 | Frozen descriptor mutation attempt | [inferred] | `Object.freeze` prevents runtime mutation; `Readonly<>` prevents compile-time mutation |
| 8 | `FeatureDescriptorInput` with extra unknown properties | [inferred] | TypeScript structural typing allows extras at compile time; runtime `Object.freeze` only includes known fields — extras are not carried to output |
| 9 | `dependencies` is an array with non-string elements | [inferred] | Throws — `.every(d => typeof d === 'string')` check |
| 10 | `enabled: undefined` (explicitly passed) | [inferred] | Valid — defaults to `true` (`enabled !== false`) |
| 11 | `timeout: null` (explicitly passed) | [inferred] | Valid — null is an accepted value, means no timeout |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| defineFeature() typed | AC-1, AC-5 |
| Input validation | AC-2, AC-3, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12 |
| Freeze + normalize | AC-4, AC-13 |
| Test coverage | All ACs verified by tests |

## Risks

| Risk | Mitigation |
|------|-----------|
| Worktree is behind base branch (only has initial commit) | Merge base branch as step 1; verify file state before implementing |
| TypeScript strict mode rejects JS runtime patterns | The `FeatureDescriptorInput` type uses optional fields with `?` and the function signature already matches the JS validation logic; `types.ts` already accounts for `null` unions |
| `Object.freeze` only shallow-freezes | Explicitly freeze inner arrays (`selectors`, `dependencies`) separately, matching original JS implementation |

## Test Strategy

- **Framework:** Vitest with jsdom environment
- **Approach:** Black-box testing via direct function calls (not internal inspection)
- **Test groups:**
  1. **Valid descriptors** — minimal with `onSetup` only, minimal with `onEach` only, full with all fields, global feature
  2. **Validation errors** — one test per error path (11 cases), using `expect(() => ...).toThrow(/message/)` matchers
  3. **Default normalization** — verify `global`, `dependencies`, `enabled`, `timeout`, and hooks are correctly defaulted
  4. **Freeze behavior** — verify `Object.isFrozen()` on returned object, selectors array, and dependencies array
  5. **Edge cases** — empty string id, null selectors, global+onSetup valid path, duplicate dependencies deduped, timeout 0/-1 rejected, truthy non-function hooks, explicit undefined enabled, explicit null timeout
