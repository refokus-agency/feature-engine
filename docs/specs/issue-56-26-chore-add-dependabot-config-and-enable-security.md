---
issue_number: 56
issue_title: "[#26] chore: add Dependabot config and enable security updates"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "beogip/add-issue-56"
created_at: "2026-08-12T20:11:38Z"
---

# Implementation Plan: #56 — [#26] chore: add Dependabot config and enable security updates

Parent epic: #26 (open-source release). Settings-side work is owned by #57.

## Files

| # | Action | Path | Purpose |
|---|---|---|---|
| 1 | create | `.github/dependabot.yml` | npm + `github-actions` ecosystem blocks; npm block carries the 3-day `cooldown` floor |
| 2 | modify | `src/__tests__/packaging.test.ts` | Guard that the config exists, is git-tracked, and still carries the cooldown floor |

## Codebase Context

- `src/__tests__/packaging.test.ts` — reuse `repoRoot = process.cwd()`, the `isTrackedByGit()` helper wrapping `execFileSync('git', ['ls-files', '--error-unmatch', file])`, and the `readonly … as const` constant style.
- Its `REQUIRED_GITHUB_TEMPLATES` block is the direct precedent: non-published `.github/` files guarded for the *same failure class*. Its committed comment states the reasoning verbatim — "GitHub only renders an issue form or PR template that is committed — a file present locally but untracked leaves the 'New issue' page silently blank."
- No YAML-parsing library exists in `devDependencies`; existing tests only ever `JSON.parse`. Assertions must therefore be raw-text based.
- `vite.config.ts` holds the vitest config (`environment: 'jsdom'`, `globals: true`, no explicit test include glob). No config change needed for a new test in `src/__tests__/`.
- Reference configs, fetched verbatim: `refokus-agency/marquee` ships npm + `github-actions` blocks; `refokus-agency/navigation` ships npm only. Copy marquee's shape. Neither uses `cooldown`.
- `CLAUDE.md`: Conventional Commits (semantic-release owns the version), ESM-only, Node >= 24, tests live in `src/__tests__/`.
- The shared platform CI workflow only runs scripts named exactly `lint` / `typecheck` / `test` / `build` — a vitest file under `src/__tests__/` is already covered by `npm test`, so no CI wiring is required.

### Target config

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    cooldown:
      default-days: 3
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
```

## Steps

1. Create `.github/dependabot.yml` with the marquee shape: `version: 2`, an `npm` entry and a `github-actions` entry, both `directory: "/"`, weekly Monday 09:00, `open-pull-requests-limit: 5`; the npm entry keeps the `minor-and-patch` group over `minor` + `patch`.
   **Done when:** the file exists, parses as valid YAML, declares `version: 2`, and `updates` holds exactly two entries with `package-ecosystem` `npm` and `github-actions`.

2. Add `cooldown: { default-days: 3 }` to the **npm entry only**.
   **Done when:** `cooldown.default-days` is `3` under the npm entry, and the `github-actions` entry contains no `cooldown` key.

3. Extend `src/__tests__/packaging.test.ts` with a `packaging — Dependabot config` describe block: a new `REQUIRED_GITHUB_CONFIG` tuple, `existsSync` + `isTrackedByGit` assertions, and a raw-text assertion on the cooldown floor via a `DEPENDABOT_COOLDOWN_DAYS = 3` constant.
   **Done when:** `npx vitest run src/__tests__/packaging.test.ts` passes, and fails if the config file is deleted, left untracked, or has the cooldown line removed.

4. Run the full local gate.
   **Done when:** `npm test`, `npm run check-types`, and `npm run lint:report` all exit 0.

## Interfaces

No new domain types — this change adds a config file and test assertions, with no data structures exchanged between functions or returned from external tools. Two new module-scope constants in `packaging.test.ts`:

- `REQUIRED_GITHUB_CONFIG: readonly ['.github/dependabot.yml']` — repo-config files guarded for existence + git tracking. Kept separate from `REQUIRED_GITHUB_TEMPLATES` because `dependabot.yml` is not a template.
- `DEPENDABOT_COOLDOWN_DAYS: 3` — single source for the floor asserted in the test, so the number is stated once rather than inlined in an assertion string.

## Function Design

- `src/__tests__/packaging.test.ts` : `isTrackedByGit(file)` — **reused unchanged**. Single concern: is this path in the git index.
- `src/__tests__/packaging.test.ts` : new `describe('packaging — Dependabot config')` — single concern: the Dependabot config is present, committed, and still encodes the 3-day floor. No orchestration or lifecycle management mixed in.

## Acceptance Criteria (EARS)

- **AC-1** The repository shall contain a `.github/dependabot.yml` file tracked by git.
- **AC-2** `.github/dependabot.yml` shall declare `version: 2` and exactly two `updates` entries, with `package-ecosystem` values `npm` and `github-actions`.
- **AC-3** The `npm` entry shall declare `directory: "/"`, a weekly Monday 09:00 schedule, `open-pull-requests-limit: 5`, and a `minor-and-patch` group over `minor` and `patch` update types, matching the `navigation` and `marquee` configs.
- **AC-4** The `npm` entry shall declare `cooldown.default-days: 3`, matching the `min-release-age=3` floor in `.npmrc`.
- **AC-5** The `github-actions` entry shall declare `directory: "/"`, a weekly Monday 09:00 schedule and `open-pull-requests-limit: 5`, and shall not declare a `cooldown` key.
- **AC-6** If `.github/dependabot.yml` is absent from the working tree or untracked by git, then `npm test` shall fail.
- **AC-7** If the `cooldown.default-days: 3` floor is removed from `.github/dependabot.yml`, then `npm test` shall fail.
- **AC-8** The test suite shall assert on `.github/dependabot.yml` without adding any YAML-parsing dependency to `package.json`.

## Out of Scope

- Enabling Dependabot alerts + security updates in repo settings — **owned by #57**. No PR can change GitHub settings.
- Verifying that the first scheduled run opens grouped minor/patch PRs — depends on #57 landing and on a Monday 09:00 schedule firing; not verifiable inside this PR.
- Renaming `packaging.test.ts`, whose name now covers more than packaging.
- Adding a YAML-parsing devDependency.
- Per-semver cooldown values (`semver-major-days`, `semver-minor-days`, `semver-patch-days`) — the flat floor was chosen to mirror `.npmrc`, which makes no semver distinction.
- Any change to `.npmrc`.
- Secret scanning, CodeQL, branch protection, topics, Private Vulnerability Reporting — all #57.
- Flipping the repo public and enabling npm provenance — #60.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|---|---|---|
| 1 | Someone re-syncs the config from marquee verbatim and the `cooldown` block silently vanishes, breaking the 3-day rule | [inferred] | AC-7: the test asserts the floor, so the suite fails |
| 2 | The file exists locally but is never committed — GitHub does nothing and reports nothing | [from issue] + precedent comment in `packaging.test.ts` | AC-1/AC-6: `isTrackedByGit` assertion |
| 3 | Invalid YAML — GitHub surfaces it only on the Insights → Dependency graph tab, easy to miss | [inferred] | Step 1 validates the YAML parses before commit |
| 4 | Repo is currently `private`; version updates may stay inert until settings/visibility change | [inferred] | Accepted: the file is inert but correct. Enabling is #57, going public is #60. Not a blocker for this PR |
| 5 | `cooldown` never applies to security updates, so a day-0 security PR can land | [from issue] | Accepted by decision — the 3-day rule yields to a known vulnerability |
| 6 | `platform` cuts a `v2` and the actions block opens a major-bump PR on the release workflow | [inferred] | Intended: that PR is the notification mechanism chosen for this |
| 7 | The `.cothinker/` session file gets committed by accident | [inferred] | Already ignored — `.gitignore` line 63; verify `git status` before committing |

## Done Criteria per Feature

| Feature | Done when |
|---|---|
| Dependabot npm ecosystem config | AC-2, AC-3, AC-4 |
| Dependabot `github-actions` ecosystem config | AC-2, AC-5 |
| Repo-config guard in the test suite | AC-1, AC-6, AC-7, AC-8 |

## Risks

- **The cooldown is numerically a no-op today** — GitHub already applies a default 3-day cooldown to version updates with no config (changelog 2025-07-01) → writing it explicitly is the point: it pins the intent and survives GitHub changing that default. Recorded here so nobody "cleans it up" later.
- **The docs give no valid range for the `*-days` fields** — a "1–90 days" figure appeared in a non-official source and could not be confirmed → the plan uses `3`, well inside any plausible bound, and hard-codes no range assumption.
- **`.npmrc` `min-release-age=3` does not cover `npm ci`** — it applies during tree resolution, not lockfile restore, so the contributor guard was leaking exactly where Dependabot writes the lockfile → closed for Dependabot by AC-4; the leak remains real for any hand-edited lockfile, which is out of scope here.
- **Two ACs from the issue body cannot be satisfied by this PR** (settings toggle, first-run observation) → moved to Out of Scope. The plan does not claim them, so #56 should be closed referencing #57 rather than marked fully done.
- **Runtime-generated files:** `.cothinker/` is created by the planning session and is already covered by `.gitignore` line 63. No `.gitkeep` is needed — nothing in that directory belongs in the repo.

## Test Strategy

Black-box, file-level assertions in `src/__tests__/packaging.test.ts` — the same shape as the existing `packaging — GitHub templates` block, so no new pattern enters the repo and no YAML parser is added.

Three assertions, each a behavioral postcondition rather than a structural triviality:

1. **Present and committed** — `existsSync` + `isTrackedByGit('.github/dependabot.yml')`. Guards the failure GitHub reports silently.
2. **The floor survives** — read the file and assert the cooldown line carries `DEPENDABOT_COOLDOWN_DAYS`. This is the assertion with real teeth: it is the only thing standing between a marquee re-sync and the 3-day rule silently disappearing.
3. **No YAML dependency crept in** — assert `package.json` declares no YAML parser in `devDependencies`, keeping AC-8 enforced rather than aspirational.

Verification: `npm test` for the full suite, plus manual negative checks — delete the file, untrack it, and strip the cooldown line, confirming each turns the suite red.

## Decision Record (cothinker session)

Full session: `.cothinker/session-2026-08-12-56-chore-add-dependabot-config-and-enable-security-u.md`

| # | Branch | Outcome |
|---|--------|---------|
| 1 | `github-actions` ecosystem block | Add it, mirroring marquee, with no `cooldown` — the option is unsupported for that ecosystem |
| 2 | Intent of `min-release-age=3` | Contributor-facing supply-chain guard: nothing younger than 3 days enters a contributor's tree |
| 3 | Cooldown policy | Align, don't diverge: flat `cooldown: { default-days: 3 }` on the npm block |
| 4 | Security updates vs the 3-day rule | The 3-day rule yields; security patches ship day 0 |
| 5 | Who flips repo settings | #57, not #56 |
| 6 | Test for `dependabot.yml` | Yes — no YAML devDependency |
| 7 | Where the test lives | `src/__tests__/packaging.test.ts` |
| 8 | Rename that file | Out of scope for #56 |

Corrections to premises in the issue body, established during the session:

- The issue says "Neither reference repo has one" about the `github-actions` block. **`marquee` has one**; `navigation` does not. There is no single org pattern on that point.
- The issue implies `cooldown` is a free choice for any ecosystem. **`github-actions` is absent from the `cooldown` support table entirely** — neither `default-days` nor the `semver-*-days` keys are available there.
