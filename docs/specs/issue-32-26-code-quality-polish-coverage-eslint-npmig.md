---
issue_number: 32
issue_title: "[#26] Code quality polish (coverage, ESLint, .npmignore)"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "beogip/issue-32-26-code-quality"
created_at: "2026-08-12T16:20:00Z"
unified_with: 52
closes: [32, 52]
---

# Implementation Plan: #32 — [#26] Code quality polish (coverage, ESLint, .npmignore)

**Unified with #52** — "chore: migrate from ESLint + Prettier to Biome".

Three of #32's five scope items are ESLint-config changes that #52 deletes outright.
Configuring them first would be dead work, so both issues land in a single PR
(human decision, 2026-08-12). Discovery session:
`.cothinker/session-2026-08-12-32-code-quality-polish-coverage-eslint-npmignore.md`.

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `package.json` | Drop 7 eslint/prettier deps, add `@biomejs/biome` + `@vitest/coverage-v8@3.2.4`; rewrite `lint` / `lint:report` / `format` |
| 2 | create | `biome.json` | Lint + format config. `recommended: true`, `noExplicitAny` at warn |
| 3 | delete | `eslint.config.js` | Superseded by Biome (takes the line-6 TODO with it) |
| 4 | delete | `.prettierrc.json` | Superseded by `biome.json` formatter |
| 5 | delete | `.npmignore` | Inert while `files` is present — measured, see Risks |
| 6 | modify | `vite.config.ts` | Add `test.coverage`: provider, exclude, thresholds |
| 7 | modify | `.gitignore` | Add `coverage/` (currently only has `dist`) |
| 8 | modify | `CLAUDE.md` (line 19) | Reads "ESLint with --fix (lint:report for no-fix)" |
| 9 | modify | `README.md` (line 237) | Lint script comment |
| 10 | **DO NOT TOUCH** | `tsconfig.eslint.json` | Load-bearing despite the name — see R3 |

## Codebase Context

- **`marquee/vite.config.ts`** — the org's OSS reference repo. Its `coverage.exclude`
  carries an inline comment explaining *why* each exclusion exists. Match that style:
  > `// Test scaffolding is not shipped code — measuring it only dilutes the number`
  > `// for src/. Vitest excludes *.test.ts on its own; the shared helpers under`
  > `// __tests__ need saying explicitly.`
- **`marquee/package.json`** — scripts use `biome lint --write ./src` and
  `biome lint ./src`. Note: `lint`, not `check`. Biome pinned exact (`2.5.7`), no caret.
- **`typescript-package-tmp/biome.json`** — good structural reference for the migrated
  shape, **but** it carries `"noExplicitAny": "off"`. Do not copy that (see R1).
- **`CLAUDE.md`** — relative imports carry explicit `.ts` extensions; the runtime entry
  must stay free of Node built-ins.
- **`src/__tests__/packaging.test.ts`** — already asserts LICENSE and NOTICE are declared,
  present on disk, and git-tracked. It is the existing safety net under the `.npmignore`
  deletion.

### Measured baseline (this repo, verified)

Measured with `npm install --no-save @vitest/coverage-v8@3.2.4`; `package.json` and
`package-lock.json` were left untouched. 188 tests pass across 5 files.

With `src/types.ts` + `src/index.ts` excluded:

| Metric | % | Covered | Uncovered |
|---|---|---|---|
| statements | 98.28 | 630/641 | **11** |
| branches | 96.93 | 253/261 | **8** |
| functions | 100 | 31/31 | **0** |
| lines | 98.28 | 630/641 | **11** |

641 statements total → 1% ≈ 6.4 statements. That jumpiness is why the gate uses
absolute counts rather than percentages.

## Steps

1. **Install Biome.** `npm i -D @biomejs/biome@2.5.8` → `package.json`
   **Done when:** `npx biome --version` prints `2.5.8`.

2. **Run the migrators** while ESLint is still installed:
   `npx biome migrate eslint --write` then `npx biome migrate prettier --write` → `biome.json`
   **Done when:** `biome.json` exists with both a `formatter` and a `linter` block.

3. **Correct the migrator output.** Set `linter.rules.recommended: true` if it emitted
   `preset: "none"`, and delete the inherited `noExplicitAny: "off"`, leaving it `"warn"`.
   → `biome.json`
   **Done when:** `rg '"preset"|"noExplicitAny"' biome.json` shows neither `"none"` nor `"off"`.

4. **Remove ESLint and Prettier.** Delete `eslint.config.js` and `.prettierrc.json`;
   drop `eslint`, `@eslint/js`, `@typescript-eslint/eslint-plugin`,
   `@typescript-eslint/parser`, `eslint-config-prettier`, `eslint-plugin-n`, `prettier`
   → `package.json`
   **Done when:** `rg -i 'eslint|prettier' package.json` returns nothing.

5. **Rewrite the scripts.** `lint` → `biome lint --write ./src`,
   `lint:report` → `biome lint ./src`, `format` → `biome format --write ./src`
   → `package.json`
   **Done when:** `npm run lint:report` exits 0.

6. **Apply formatting in its own commit.** Run `npm run format` and commit the
   reformat separately from any logic or config change.
   **Done when:** `npm run lint:report` exits 0 and the commit touches formatting only.

7. **Install coverage.** `npm i -D @vitest/coverage-v8@3.2.4` (exact — must match the
   installed `vitest@3.2.4`) → `package.json`
   **Done when:** `npm run test:coverage` runs and emits a report.

8. **Add the coverage block** with `exclude` and `thresholds` → `vite.config.ts`
   **Done when:** `npm run test:coverage` exits 0.

9. **Re-measure and reconcile.** The `-11 / -8 / -11` figures came from an ad-hoc
   exclude list. Run against the real config and correct the numbers if they differ.
   → `vite.config.ts`
   **Done when:** each threshold equals the reported uncovered count exactly (zero slack).

10. **Housekeeping.** Add `coverage/` to `.gitignore`; update `CLAUDE.md:19` and
    `README.md:237` so neither describes lint as ESLint.
    **Done when:** `git status` is clean after `npm run test:coverage`.

11. **Packaging verification.** `npm run build && npm pack --dry-run`; compare the packed
    file list against the pre-change list.
    **Done when:** the two lists are identical.

## Interfaces

N/A — this is configuration work. No new data structures are exchanged between functions
or returned from external tools, so there is nothing to name. Left empty deliberately
rather than inventing an interface to fill the section.

## Function Design

N/A — same reason. No new functions are introduced.

## Acceptance Criteria (EARS)

- **AC-1.** The package shall declare `@vitest/coverage-v8` at exactly `3.2.4`.
- **AC-2.** When `npm run test:coverage` is run, it shall complete and print a v8 coverage report.
- **AC-3.** The coverage configuration shall exclude `src/types.ts`, `src/index.ts`, and `src/__tests__/**`.
- **AC-4.** The coverage thresholds shall use absolute counts for statements, branches, and lines, and `functions: 100`.
- **AC-5.** If uncovered items exceed the recorded baseline in any metric, then `npm run test:coverage` shall exit non-zero.
- **AC-6.** The coverage config shall express the functions gate as `functions: 100`, never `-0`.
- **AC-7.** The repository shall not contain `eslint.config.js`, `.prettierrc.json`, or `.npmignore`.
- **AC-8.** The package shall not declare any eslint or prettier dependency.
- **AC-9.** The package shall declare `@biomejs/biome` pinned to an exact version.
- **AC-10.** `biome.json` `linter.rules.recommended` shall be `true`.
- **AC-11.** `biome.json` shall not set `noExplicitAny` to `off`; it shall be `warn`.
- **AC-12.** `noDebugger` shall be active via the recommended preset.
- **AC-13.** When `npm run lint:report` is run, it shall exit 0.
- **AC-14.** When `npm run lint:report` is run, it shall report at least one `noExplicitAny` warning.
- **AC-15.** `.gitignore` shall contain `coverage/`.
- **AC-16.** When `npm run check-types` is run, it shall exit 0.
- **AC-17.** When `npm run build && npm pack --dry-run` is run, the packed file list shall be identical to the pre-change list.
- **AC-18.** When `npm test` is run, all 188 tests shall pass.
- **AC-19.** `CLAUDE.md` and `README.md` shall not describe the lint step as ESLint.

## Out of Scope

- Coverage gates for `marquee` and `navigation` — separate repos, separate PRs, and their
  baselines differ, so these numbers do not transfer. Follow-up issues.
- Fixing the `any` in `src/types.ts:29` (`ExposeFn`) — public API surface.
- Fixing the 22 `any` casts in `src/__tests__/vite-plugin.test.ts`.
- Renaming `tsconfig.eslint.json` — ripples into historical `docs/specs/` files.
- Raising coverage. This change gates the current number; it does not improve it.
- Touching the external `refokus-agency/platform` `ci.yml@v1` reusable workflow.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | `biome migrate eslint` leaves `linter.rules.preset: "none"`, silently dropping the inherited baseline | [from issue #52] | Step 3 forces `recommended: true`; AC-10 |
| 2 | `biome migrate eslint` ports `'@typescript-eslint/no-explicit-any': 'off'` literally, cancelling #32's ask | [inferred — proven in `typescript-package-tmp`'s live `biome.json`] | Step 3 deletes it; AC-14 proves the rule is live with a real warning |
| 3 | Someone deletes `tsconfig.eslint.json` because the name says "eslint" | [inferred] | Files table marks it DO NOT TOUCH; AC-16 catches it |
| 4 | `functions: -0` silently always passes (`-0 >= 0` is `true` in JS) | [inferred — verified in vitest source] | AC-6 |
| 5 | `coverage/` shows up untracked in `git status` | [inferred] | Step 10 adds it to `.gitignore`; AC-15 |
| 6 | Thresholds do not match once the real exclude list is in place | [inferred] | Step 9 re-measures before closing |
| 7 | Deleting `.npmignore` changes the published tarball | [inferred] | AC-17 diffs the file lists; `packaging.test.ts` covers LICENSE/NOTICE |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Coverage operational | AC-1, AC-2, AC-3 |
| Coverage gate | AC-4, AC-5, AC-6 |
| Biome migration | AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-19 |
| Packaging cleanup | AC-15, AC-16, AC-17, AC-18 |

## Risks

- **R1 — The migrator cancels the issue's own request.** `biome migrate eslint` ports
  explicit `off` settings literally. This repo has `'@typescript-eslint/no-explicit-any': 'off'`
  at `eslint.config.js:48`, so a naive migration emits `"noExplicitAny": "off"` — the exact
  opposite of what #32 asks for. Proven: that is what `typescript-package-tmp`'s `biome.json`
  says today. → Step 3, and AC-14 requires a *real emitted warning*, not just a config value.

- **R2 — The migrator drops the inherited baseline.** Documented in #52: extended presets
  are not mapped to `recommended: true`, leaving `preset: "none"`. → Step 3, AC-10.

- **R3 — 🔴 `tsconfig.eslint.json` is not an ESLint file despite its name.** Issue #35
  repointed `check-types` at it (`package.json:53`), so it now backs the CI type gate and
  `prepublishOnly`, and it is what causes the compile-time type assertions in
  `src/__tests__/define-feature.test.ts:346` to be checked at all. Deleting it during the
  ESLint teardown breaks the typecheck silently. → DO NOT TOUCH row, AC-16.

- **R4 — Formatting churn.** Measured: 8 of 12 files under `src/` reformat under Biome's
  ported Prettier settings. → Step 6 isolates the reformat in its own commit so the review
  diff stays readable.

- **R5 — PR size.** The sibling repo's migration moved the lockfile by +310/-1659, and this
  change adds `@vitest/coverage-v8` on top. This will exceed the 400-line review budget.
  The human explicitly chose a single PR (2026-08-12); the mitigation is commit hygiene —
  reformat, lockfile, and logic each in their own commit — not a split.

- **R6 — The gate is brittle by design.** Thresholds are pinned at the baseline with zero
  slack, so the next uncovered line turns CI red. That is the intent. The consequence: if
  the `exclude` list ever changes, the numbers must be recomputed or the gate becomes
  meaningless.

## Test Strategy

- **`npm test`** — the existing 188 tests, unmodified (AC-18).
- **`npm run check-types`** — the guard for R3 (AC-16).
- **`npm run lint:report`** — assert *both* that it exits 0 **and** that it emits at least one
  `noExplicitAny` warning. Exit 0 alone only proves nothing broke; the warning proves the rule
  is actually live (AC-13, AC-14).
- **Negative gate test** — temporarily add an uncovered function, confirm `npm run test:coverage`
  exits non-zero, then revert. Without this the gate itself ships untested.
- **Packaging** — `npm run build && npm pack --dry-run` before and after deleting `.npmignore`;
  the two file lists must be identical (AC-17).
- **Commits** — `chore:` type. semantic-release does not cut a release for `chore:`, matching
  the approach taken in #27.

### Evidence: `.npmignore` is inert

Measured on this repo's exact toolchain (npm 11.9.0 / node v24.14.0):

```
WITH "files" in package.json:
  .npmignore='dist/keepme.js'  → dist/keepme.js SHIPPED
  .npmignore='keepme.js'       → dist/keepme.js SHIPPED
  .npmignore='**/keepme.js'    → dist/keepme.js SHIPPED
  .npmignore='dist/'           → dist/keepme.js SHIPPED
WITHOUT "files" (control):
  .npmignore='dist/keepme.js'  → correctly excluded
```

Four pattern forms, including one that should wipe the whole directory. None had any effect.
npm's docs still claim `.npmignore` overrides `files` in subdirectories; that sentence is
stale for npm 11. This is why the file is deleted rather than tidied — a cleaned-up
`.npmignore` reads as protection while providing none.

### Evidence: negative thresholds

`node_modules/vitest/dist/chunks/coverage.DL5VHqXY.js:4152`:

> Positive thresholds are treated as minimum coverage percentages (X means: X% of lines must
> be covered), while negative thresholds are treated as maximum uncovered counts (-X means:
> X lines may be uncovered).

### Resulting coverage config

```ts
coverage: {
  provider: 'v8',
  exclude: [
    ...coverageConfigDefaults.exclude,
    'src/types.ts',      // type-only — erased at runtime, structurally uncoverable
    'src/index.ts',      // barrel re-export
    'src/__tests__/**',  // test scaffolding is not shipped code
  ],
  thresholds: {
    statements: -11,
    branches: -8,
    lines: -11,
    functions: 100, // NOT -0 — `-0 >= 0` is true in JS, which silently always passes
  },
}
```
