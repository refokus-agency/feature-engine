---
issue_number: 27
issue_title: "[#26] chore: relicense to Apache-2.0, add NOTICE, fix package.json metadata"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "beogip/fix-issue-27"
created_at: "2026-08-07T14:19:57Z"
---

# Implementation Plan: #27 — [#26] chore: relicense to Apache-2.0, add NOTICE, fix package.json metadata

## Decisions Resolved During Planning

The issue left one decision explicitly open and hid two more. All three are closed:

| Decision | Resolution | Rationale |
|---|---|---|
| `engines.node` floor | **Unchanged (`>=24.0.0`)** | The issue proposed lowering to `>=22.0.0` to match `navigation`. Rejected: the shared CI workflow `refokus-agency/platform/.github/workflows/ci.yml@v1` defaults `node-version` to `'24'` and does **not** read `.nvmrc`, and `.nvmrc` pins `v24.14.0`. Declaring a floor that is never exercised is a false claim. The floor is what CI actually tests. |
| `@semantic-release/git` | **Removed from `.releaserc.json`** | Its default `assets` are `["CHANGELOG.md", "package.json", "package-lock.json", "npm-shrinkwrap.json"]`, so it commits the bumped version back to `main` (see `97b5382 chore(release): 1.3.1 [skip ci]`). Without removing it, `version: "0.0.0-development"` regresses on the next release. Neither `navigation` nor `marquee` includes this plugin. |
| `CHANGELOG.md` | **Deleted** | Once the git plugin is gone the file freezes at 1.3.1 and misrepresents the package as stale. Neither `navigation` nor `marquee` has a committed `CHANGELOG.md`; release notes live in GitHub Releases. Full history remains recoverable from git and from the existing GitHub Releases. |

**Reference model: `navigation`, not `marquee`.** `marquee` still carries `repository.url: "git+ssh://git@github.com/refokus-agency/marquee.git"` — it has not been updated. The two repos' `LICENSE` files are byte-identical to each other, and their `NOTICE` files share one structure, so `marquee` serves as secondary confirmation for license wording only.

## Files

| File | Change |
|---|---|
| `LICENSE` | Replace MIT (21 lines) with the Apache-2.0 full text (201 lines), byte-identical to `navigation`/`marquee`, appendix line `Copyright 2026 Refokus LLC` |
| `NOTICE` | **New.** Mirrors `navigation` with the package name `@refokus-agency/feature-engine` |
| `package.json` | 5 fields: `version`, `license` (new key), `author`, `repository.url`, `files` |
| `package-lock.json` | Root `version` fields (lines 3 and 9) → `0.0.0-development`. Regenerating also propagates the new `license` key and corrects pre-existing drift: `acorn` was declared under `dependencies` in `package.json` on `main` but carried `"dev": true` in the lockfile. Kept deliberately — see Edge Case 7 |
| `README.md` | Add an Apache-2.0 badge under the title; rewrite the `## License` section (lines 248–250) |
| `.releaserc.json` | Remove `"@semantic-release/git"` **and `"@semantic-release/changelog"`** from the `plugins` array |
| `CHANGELOG.md` | **Deleted** |
| `CLAUDE.md` | Rewrite the `## Releases` section: the version stays pinned in git, there is no changelog, and the packaging guard is documented |
| `src/__tests__/packaging.test.ts` | **New.** Asserts `LICENSE`/`NOTICE` are declared in `files`, present on disk, and tracked by git |
| `.gitignore` | Ignore `.atl` and `.cothinker` (local AI-tooling caches). Unrelated hygiene, written by session tooling during implementation — kept rather than reverted, and called out here so it is not mistaken for silent scope creep |

**Explicitly untouched:** `.nvmrc`, `.github/workflows/*`, `publishConfig`, `src/**` (runtime), `tsconfig*.json`.

## Codebase Context

Verified state before the change:

- `LICENSE:1` → `MIT License`; `LICENSE:2` → `Copyright (c) 2022 Refokus LLC`. 21 lines total.
- `NOTICE` does not exist at root.
- `package.json` current values: `version: "1.3.1"`, `license` **key absent entirely**, `author: ""`, `repository.url: "git+ssh://git@github.com/refokus-agency/feature-engine.git"`, `engines: { "node": ">=24.0.0" }`, `publishConfig: { "registry": "https://npm.pkg.github.com" }`.
- `package.json` `files` currently ends with `"README.md", "LICENSE"` — no `NOTICE`.
- `README.md:248` → `## License`; `README.md:250` → `See [LICENSE](LICENSE) file.` No badge anywhere in the README, and no inline `MIT` or `Apache-2.0` text.
- `git+ssh` appears in exactly **one** place repo-wide: `package.json:40`.
- `MIT` outside `LICENSE:1` appears only in `package-lock.json` (~300 hits, all transitive dependencies' own license fields).
- `YOUR_NAME_HERE` does not exist in any file — the issue's note about this is confirmed.
- `Copyright` appears only at `LICENSE:3`.

Patterns to respect:

- **npm auto-includes `LICENSE` and `README.md` in the tarball regardless of `files`. `NOTICE` is NOT auto-included.** Adding `"NOTICE"` to `files` is functionally required, not cosmetic — this is what makes AC-8 pass.
- `LICENSE` and `NOTICE` must be copied verbatim from `navigation`, not hand-authored. The Apache-2.0 appendix placeholder `[yyyy] [name of copyright owner]` is already correctly filled in upstream; retyping it invites drift.
- `navigation` NOTICE content (the template — line 1 is the only line that changes):

  ```
  @refokus-agency/feature-engine
  Copyright 2026 Refokus LLC

  This product includes software developed by Refokus LLC.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
  ```

- `navigation` README license section, to mirror:
  - Badge near top: `[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)`
  - Section body: `Licensed under the [Apache License 2.0](LICENSE). See also [NOTICE](NOTICE).`

Reference implementations to diff against:

- `gh api repos/refokus-agency/navigation/contents/LICENSE --jq .content | base64 -d`
- `gh api repos/refokus-agency/navigation/contents/NOTICE --jq .content | base64 -d`

## Steps

1. **`LICENSE`** — overwrite with the Apache-2.0 text from `navigation`.
   **Done when:** `diff LICENSE <(gh api repos/refokus-agency/navigation/contents/LICENSE --jq .content | base64 -d)` produces no output.

2. **`NOTICE`** — create it with `navigation`'s content, line 1 set to `@refokus-agency/feature-engine`.
   **Done when:** the file exists and its diff against `navigation`'s `NOTICE` shows a difference on line 1 only.

3. **`package.json`** — set `version` to `"0.0.0-development"`; add `"license": "Apache-2.0"`; set `author` to `"Refokus LLC"`; rewrite `repository.url` to `git+https://github.com/refokus-agency/feature-engine.git`; append `"NOTICE"` to the `files` array.
   **Done when:** all 5 fields read the new values, `engines.node` still reads `">=24.0.0"`, `publishConfig` is unchanged, and the file parses as valid JSON.

4. **`.releaserc.json`** — remove the `"@semantic-release/git"` entry from `plugins`.
   **Done when:** `rg "semantic-release/git" .releaserc.json` returns nothing and the file parses as valid JSON.

5. **`CHANGELOG.md`** — delete via `git rm CHANGELOG.md`.
   **Done when:** the file is absent from the working tree and staged as a deletion.

6. **`package-lock.json`** — run `npm install --package-lock-only` to propagate the version.
   **Done when:** `rg '"version": "0.0.0-development"' package-lock.json` returns 2 hits and no dependency was re-resolved — verify with `git diff -U0 -- package-lock.json | rg '^[+-]' | rg 'integrity|resolved'`, which must return nothing. Propagating the `license` key and correcting the `acorn` classification are expected and must NOT be reverted; only a changed `integrity`/`resolved`/dependency `version` counts as churn.

7. **`README.md`** — insert the Apache-2.0 badge directly under the `# @refokus-agency/feature-engine` title; rewrite the `## License` section to state Apache-2.0 inline and link both `LICENSE` and `NOTICE`.
   **Done when:** `rg -c 'Apache[- ]2\.0|Apache License 2\.0' README.md` returns at least 2 and the License section links both files. Note the two mentions are phrased differently — the badge reads `Apache-2.0`, the prose reads `Apache License 2.0` — so a literal `rg -c "Apache-2.0"` returns 1 and is NOT a failure signal.

8. **Verification** — `npm run build && npm test && npm run check-types && npm pack --dry-run`.
   **Done when:** 182/182 tests pass, build and type-check exit clean, and the `npm pack --dry-run` file list contains both `LICENSE` and `NOTICE`.

## Interfaces

No API changes. Zero modifications under `src/`. All public exports keep their current shape:

- Entry `.` — `defineFeature`, `loadFeatures`, and all types from `src/types.ts`
- Entry `./vite` — `featureMetadataPlugin`, `ParsedFeatureMeta`

`FeatureDescriptor` and `FeatureMeta` remain distinct and untouched.

## Function Design

N/A — this is a licensing and metadata change. No function is added, removed, or modified.

## Acceptance Criteria (EARS)

- **AC-1** — The `LICENSE` file shall contain the full Apache License 2.0 text with the appendix copyright line `Copyright 2026 Refokus LLC`.
- **AC-2** — The repository shall contain a `NOTICE` file at root whose content matches `refokus-agency/navigation`'s `NOTICE` with the package name `@refokus-agency/feature-engine`.
- **AC-3** — `package.json` shall declare `"license": "Apache-2.0"`.
- **AC-4** — `package.json` shall declare `"author": "Refokus LLC"`.
- **AC-5** — `package.json` shall declare `"version": "0.0.0-development"`.
- **AC-6** — `package.json` `repository.url` shall use the `git+https://` scheme.
- **AC-7** — `package.json` `files` shall include `"NOTICE"`.
- **AC-8** — When `npm pack --dry-run` is run, the emitted file list shall include both `LICENSE` and `NOTICE`.
- **AC-9** — `package.json` `engines.node` shall remain `">=24.0.0"`.
- **AC-10** — `README.md` shall state `Apache-2.0` inline in its License section and shall link both `LICENSE` and `NOTICE`.
- **AC-11** — `.releaserc.json` `plugins` shall not include `@semantic-release/git`.
- **AC-12** — When a release runs on `main`, the committed `package.json` version shall remain `0.0.0-development`.
- **AC-13** — `package-lock.json` shall declare the root package version as `0.0.0-development`.
- **AC-14** — `CHANGELOG.md` shall not exist in the repository.
- **AC-15** — When `npm test`, `npm run build`, and `npm run check-types` are run on Node 24, they shall all pass.
- **AC-16** — If any shipped, source, or legal file still references the MIT license, then the change shall be treated as incomplete. Scope excludes `package-lock.json` (transitive dependency metadata) and `docs/specs/**` (planning artifacts, which narrate the pre-change MIT state on purpose). Verify with `rg 'MIT' --glob '!package-lock.json' --glob '!docs/specs' .`
- **AC-17** — If `publishConfig.registry` changes, then the change shall be reverted — issue #28 owns the registry migration.

## Out of Scope

- **Registry migration** — `publishConfig`, workflow changes, OIDC → issue **#28**
- **README GitHub Packages install instructions** (lines 11–15) — they document `npm.pkg.github.com`, which moves in **#28**
- **`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`** — none exist in this repo; both `navigation` and `marquee` have all three. Owned by issue **#30** (verified: #30 covers all three, using `marquee` as the reference implementation).
- **Lowering `engines.node`** — explicitly rejected during planning (see Decisions Resolved)
- **`.nvmrc` and `CLAUDE.md` Node references** — both stay accurate because the floor stays at 24
- **CI `node-version`** — stays at the shared workflow's default of `'24'`
- **The ~300 `"license": "MIT"` entries in `package-lock.json`** — transitive dependency metadata, not ours to change

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|---|---|---|
| 1 | Deleting `CHANGELOG.md` loses release history | [discovered during planning] | History stays fully recoverable from git log and from existing GitHub Releases. Matches `navigation`/`marquee`, neither of which has a committed changelog. `@semantic-release/changelog` stays in the plugin list so notes are still generated for the GitHub Release body. |
| 1b | Deleting `CHANGELOG.md` contradicts issue **#30**, whose body says "CHANGELOG.md — no action. Already present and generated by `@semantic-release/changelog`" and whose title lists `CHANGELOG` in scope | [discovered during planning] | Cross-issue conflict, flagged in a comment on #27. **#30's body and title must be updated to drop `CHANGELOG` before it is worked.** Not a blocker for #27 — #30 is downstream. #30 also defers `engines.node` to this issue ("Node >= whatever #27 settles on"); the answer for its `CONTRIBUTING.md` is `>= 24`. |
| 2 | `npm pack --dry-run` fails because `dist/` does not exist | [inferred] | Step 8 runs `npm run build` before `npm pack --dry-run`. The `files` array is `dist/`-scoped, so the pack is meaningless without a build. |
| 3 | semantic-release miscomputes the next version from `0.0.0-development` | [inferred] | Does not happen — semantic-release derives the version from git tags, not `package.json`. Tags `v1.3.x` remain intact, so the next release computes from 1.3.1. |
| 4 | Publishing with `version: "0.0.0-development"` ships a 0.0.0 tarball | [inferred] | `@semantic-release/npm` bumps the version in the working directory before publishing. Only the commit-back is removed, not the bump. |
| 5 | Apache-2.0 appendix left as `[yyyy] [name of copyright owner]` | [from issue] | Copy `LICENSE` verbatim from `navigation`, which already has it filled in. Never hand-fill. |
| 6 | Relicensing requires contributor consent | [from issue] | Verified against `git log --format='%an %ae' \| sort -u`, not assumed. Two human authors: Juan Ignacio Gipponi (43 commits) and Tomas Aprile (3 commits, `tomas.eaprile@gmail.com`). Tomas's commits touch only `.releaserc.json` and `.github/workflows/main-release.yml` — CI/release configuration, never `src/**`. None of the relicensed software surface carries third-party authorship, and trivial config edits are de minimis / non-original expression. Unblocked. |
| 7 | `npm install --package-lock-only` churns unrelated dependency entries | [inferred] | Gate on `git diff --stat package-lock.json` in step 6 — only the two root `version` lines may change. Revert and edit the two lines by hand if churn appears. |
| 8 | `git+https` in `repository.url` breaks semantic-release's push to `main` | [inferred] | It does not — the pipeline authenticates via token/OIDC, not via this field. `navigation` already ships `git+https` with the same release setup. |
| 9 | `node_modules` absent in the worktree, so verification cannot run | [discovered during planning] | Already resolved this session: `npm ci` installed 372 packages. |
| 10 | MIT-licensed copies of 1.3.1 already in the wild | [inferred] | Anything already distributed under MIT stays MIT permanently. The relicense applies from the next release onward. Legally sound because Refokus LLC owns the full copyright. |

## Done Criteria per Feature

| Feature | ACs that must all pass |
|---|---|
| Apache-2.0 relicense | AC-1, AC-2, AC-16 |
| package.json metadata | AC-3, AC-4, AC-5, AC-6, AC-7, AC-9 |
| Durable version (`0.0.0-development`) | AC-11, AC-12, AC-13 |
| Changelog removal | AC-14 |
| Tarball contents | AC-8, AC-17 |
| Documentation | AC-10 |
| No regression | AC-15 |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Removing `@semantic-release/git` changes the release pipeline and is only provable on the next merge to `main` | **High** | The only change in this plan that cannot be verified locally. Both `navigation` and `marquee` run exactly this plugin set in production — empirical evidence, not theory. Rollback is a one-line restore in `.releaserc.json`. |
| MIT → Apache-2.0 is effectively irreversible for consumers already on 1.3.1 | Medium | Copies distributed under MIT remain MIT forever; the new license binds from the next release. Sound because Refokus LLC holds the full copyright. |
| `CHANGELOG.md` deletion is an outward-facing, history-losing change | Medium | Explicitly requested and approved during planning. Content stays recoverable from git history and GitHub Releases. |
| `engines.node: ">=24.0.0"` diverges from `navigation`/`marquee` (`>=22.0.0`) and may read as an oversight in review | Low | Deliberate decision, not a miss. Worth a comment on issue #27 explaining that the floor tracks what CI exercises. |
| `npm install --package-lock-only` may pull newer transitive versions | Low | Gated by the `git diff --stat` check in step 6. |

## Test Strategy

- **Existing suite, unchanged:** 182 tests across 4 files — `define-feature.test.ts` (49), `vite-plugin.test.ts` (49), `loader.test.ts` (77), `loader.smoke.test.ts` (7). No new tests: there is no new code to test.
- **Regression gate:** `npm test && npm run build && npm run check-types` on Node 24 (the declared floor and the CI version).
- **Change-specific verification** (step 8, manual):
  - `npm pack --dry-run` output must list both `LICENSE` and `NOTICE`
  - `diff` of `LICENSE` against `navigation`'s must be empty
  - `diff` of `NOTICE` against `navigation`'s must differ on line 1 only
- **Already verified during planning:** 182/182 tests, `build`, and `check-types` all pass on Node 22.19.0. Recorded for completeness even though the final floor is 24 — it proves nothing in `src/` requires Node 24, so the floor is a policy choice rather than a technical constraint.
- **Not verifiable pre-merge:** AC-12 (version stays `0.0.0-development` after a release). Confirm on the first release following this change.
