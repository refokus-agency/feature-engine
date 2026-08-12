---
issue_number: 31
issue_title: "[#26] Add GitHub templates + badges"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "beogip/add-issue-31"
created_at: "2026-08-12T00:00:00Z"
---

# Implementation Plan: #31 — [#26] Add GitHub templates + badges

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | create | `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug form; auto-labels `bug` |
| 2 | create | `.github/ISSUE_TEMPLATE/feature_request.yml` | Problem / proposal / alternatives form; auto-labels `enhancement` |
| 3 | create | `.github/ISSUE_TEMPLATE/config.yml` | Disables blank issues, adds security-advisory contact link |
| 4 | create | `.github/pull_request_template.md` | Lowercase filename; checklist per issue body |
| 5 | modify | `README.md` | Insert CI + npm-version badges above the existing Apache-2.0 badge |
| 6 | modify | `package.json` | Add 4 keywords |
| 7 | modify | `src/__tests__/packaging.test.ts` | Extend to guard the new `.github` files are git-tracked |

## Codebase Context

- **`src/__tests__/packaging.test.ts`** — reuse its `isTrackedByGit` helper. `CLAUDE.md` documents why it exists: a file that is listed but untracked fails silently. The same failure class applies to `.github` templates — an uncommitted form simply does not appear on GitHub.
- **`.github/workflows/pr-ci.yml`** — filename verified. The CI badge URL depends on it exactly: `https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml/badge.svg`.
- **Sibling repos** — `navigation`'s templates are the org standard. `marquee` diverges (adds a Discussions contact link, adds `?event=pull_request` to the CI badge). The issue specifies `navigation`'s shape, so follow that.
- **Sibling `bug_report.yml` Environment copy says "GSAP version"** — GSAP boilerplate carried between sibling repos. `feature-engine` has no GSAP dependency; adapt to Node.js / bundler / browser as the issue states.
- **`CLAUDE.md` constraints** — never touch `package.json` `version` (semantic-release owns it); keep `LICENSE`/`NOTICE` in `files` untouched.
- **Labels verified via `gh label list`** — `bug` and `enhancement` exist in `feature-engine`. `needs-triage` exists only in `marquee` (`#bc3d70`), not in `navigation` or `feature-engine`, though both sibling forms reference it. Issue **#57** adds `needs-triage` + `needs-info` to this repo, so the reference is kept: GitHub drops an unknown label silently, making it forward-compatible.
- **`.gitignore`** — `.cothinker` is ignored (line 63). `.github` is not mentioned anywhere, so no new file is at risk of being silently ignored.

## Steps

1. **Create `.github/ISSUE_TEMPLATE/bug_report.yml`** — `labels: [bug]`; required fields: version (with a description naming `@refokus-agency/feature-engine`), description, reproduction, expected, environment (Node.js / Bundler / Browser placeholders).
   **Done when:** file exists, `labels:` contains only `bug`, and no field mentions GSAP.

2. **Create `.github/ISSUE_TEMPLATE/feature_request.yml`** — byte-identical to `navigation`'s except `labels: [enhancement]`.
   **Done when:** file exists; `problem` and `proposal` are `required: true`, `alternatives` is `required: false`.

3. **Create `.github/ISSUE_TEMPLATE/config.yml`** — verbatim from the issue body (security link only).
   **Done when:** `blank_issues_enabled: false` and the advisories URL contains `feature-engine`.

4. **Create `.github/pull_request_template.md`** — summary, `Closes #`, type-of-change checklist, and checklist: linked issue / tests added-updated / `npm run check-types` clean / docs updated.
   **Done when:** file exists at that exact lowercase path and contains all 4 checklist items.

5. **Modify `README.md`** — insert the CI and npm-version badge lines immediately after the H1, **before** the existing license badge, so the order is CI, npm, License (matches siblings).
   **Done when:** README lines 3–5 are the three badges in that order, and the CI badge URL ends `/workflows/pr-ci.yml/badge.svg`.

6. **Modify `package.json` keywords** — append `lazy-loading`, `esm`, `browser`, `dependency-graph`.
   **Done when:** the keywords array has exactly 9 entries and `npm run check-types` still passes.

7. **Extend `src/__tests__/packaging.test.ts`** — new describe block asserting each of the 4 new `.github` files exists on disk **and** is tracked by git, reusing `isTrackedByGit`; plus the keywords-set and README badge-order assertions.
   **Done when:** `npx vitest run src/__tests__/packaging.test.ts` passes with the new cases.

## Interfaces

**N/A (0)** — this change adds static YAML/Markdown config and edits two manifest fields. No data structures are exchanged and no TypeScript source is added.

## Function Design

**N/A (0)** — no new functions. Step 7 adds test cases only, reusing the existing `isTrackedByGit` helper rather than introducing a new abstraction.

## Acceptance Criteria (EARS)

- **AC-1.** The repository shall contain `bug_report.yml`, `feature_request.yml`, and `config.yml` under `.github/ISSUE_TEMPLATE/`, all three tracked by git.
- **AC-2.** `config.yml` shall set `blank_issues_enabled` to `false`.
- **AC-3.** When a user opens the "New issue" page on GitHub, the page shall present the Bug Report form, the Feature Request form, and the "Security vulnerability" contact link, and shall not offer a blank-issue option.
- **AC-4.** When a Bug Report form is submitted, the created issue shall carry the `bug` label.
- **AC-5.** When a Feature Request form is submitted, the created issue shall carry the `enhancement` label.
- **AC-6.** The issue forms shall reference `needs-triage` alongside `bug`/`enhancement`, even though the label does not yet exist in this repository — #57 creates it, and GitHub drops an unknown label silently rather than failing, so the reference is forward-compatible and needs no follow-up edit.
- **AC-7.** The bug report form shall require package version, description, reproduction steps, expected behavior, and environment covering Node.js version, bundler, and browser.
- **AC-8.** The feature request form shall require problem and proposed solution, and shall accept alternatives-considered as optional.
- **AC-9.** `.github/pull_request_template.md` shall exist with that exact lowercase filename and be tracked by git.
- **AC-10.** When a contributor opens a new pull request, the PR body shall be pre-populated with a checklist covering linked issue, type of change, tests added/updated, `npm run check-types` clean, and docs updated.
- **AC-11.** `README.md` shall display, directly under the H1, a CI badge, an npm-version badge, and the Apache-2.0 badge, in that order.
- **AC-12.** The CI badge shall reference the workflow file `pr-ci.yml`.
- **AC-13.** `package.json` keywords shall contain exactly: `webflow`, `feature-loading`, `code-splitting`, `vite`, `typescript`, `lazy-loading`, `esm`, `browser`, `dependency-graph`.
- **AC-14.** If the npm-version badge renders "not found" because the package is absent from the public npm registry, then the badge shall remain unchanged — expected until #28 ships.
- **AC-15.** The change shall not modify `package.json` `version`, `package.json` `files`, or any file under `.github/workflows/`.

## Out of Scope

- `.github/dependabot.yml` — separate issue (stated in the issue body).
- Repo topics, labels, security settings — repo-settings issue.
- #28's registry migration (GitHub Packages → public npm) and the README `.npmrc` note that depends on it.
- Creating a `needs-triage` label to match the siblings.
- A Discussions contact link (`marquee` has one, `navigation` does not; the issue asks only for the security link).
- Adding a YAML parser devDependency to structurally validate the forms.

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | npm badge 404s — package not on public npm (`publishConfig` points at `npm.pkg.github.com`) | [from issue] | Ship as-is. The issue explicitly declares this expected until #28. Recorded as AC-14. |
| 2 | Forms reference `needs-triage`, absent from this repo until #57 creates it | [inferred] | Keep the reference. `marquee` has the label (`#bc3d70`) and applies it via the form's `labels:` field — no workflow involved. #57 explicitly commits to creating `needs-triage` + `needs-info` here. GitHub drops an unknown label silently instead of erroring, so form issues get only `bug`/`enhancement` until #57 lands, then the label starts applying with no edit to these files. |
| 3 | A template file is written but never `git add`ed → form silently absent on GitHub | [inferred] | Step 7's git-tracked assertions catch it locally, same mechanism as the LICENSE/NOTICE guard. |
| 4 | Malformed YAML → GitHub silently falls back to a blank issue body | [inferred] | AC-3 requires visual verification on GitHub after push; no local YAML parser is available. |
| 5 | Sibling Environment field asks for "GSAP version" — wrong package | [inferred] | Rewrite to Node.js / bundler / browser per the issue's own wording. |
| 6 | `pr-ci.yml` triggers only on `pull_request`, so the badge shows no status until a PR runs | [inferred] | Accept. The badge resolves to the workflow's latest run regardless of event; `marquee`'s `?event=pull_request` variant is not what the issue specifies. |
| 7 | Uppercase `PULL_REQUEST_TEMPLATE.md` created by habit → GitHub still honors it, but drifts from org standard | [from issue] | AC-9 pins the exact lowercase path; step 4's done-criterion checks it. |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Issue forms | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8 |
| PR template | AC-9, AC-10 |
| README badges | AC-11, AC-12, AC-14 |
| Keywords | AC-13 |
| _(all four)_ | AC-15 applies across every feature as a non-regression guard |

## Risks

| Risk | Mitigation |
|------|------------|
| Copying sibling templates verbatim imports GSAP-specific and label-specific wrong content | Adapt deliberately per step 1 and edge cases 2 & 5; the issue's own wording is authoritative |
| AC-3 and AC-10 cannot be verified locally — they only manifest on GitHub | Verify manually after the PR is pushed; record the check in the PR description |
| Keyword edit could collide with the semantic-release manifest rewrite | Only `keywords` is touched; `version` stays `0.0.0-development` (AC-15) |
| Badge order drifting from siblings, making the three repos inconsistent | Step 5 pins CI, npm, License explicitly |
| Runtime-generated files leaking into the commit | None are produced by this change. `.cothinker/` is already gitignored (line 63); `.github` is not ignored anywhere, so nothing is at risk of being silently dropped |

## Test Strategy

**Automated** — extends `src/__tests__/packaging.test.ts`, black-box against the filesystem + git index:

- Each of the 4 new `.github` files exists on disk and is tracked by git (reuses `isTrackedByGit`).
- `package.json` keywords equals the exact 9-entry set → covers AC-13.
- README contains the `pr-ci.yml` badge URL and the three badges appear in CI / npm / License order → covers AC-11, AC-12.

These are behavioral, not structural: an untracked or misnamed file is precisely the failure the existing packaging test was written to catch (documented in `CLAUDE.md`).

**Local gate:** `npm test && npm run check-types && npm run lint:report`

**Manual, post-push only** (cannot be asserted locally):

- Open `/issues/new/choose` → both forms + security link, no blank option (AC-3).
- Open a PR → body pre-populated with the checklist (AC-10).
- Inspect the form preview / submit a test form → labels apply (AC-4, AC-5).
