---
issue_number: 30
issue_title: "[#26] Create community files (CONTRIBUTING, SECURITY, CoC)"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "full"
depth: "medium"
branch_name: "docs/30-community-files"
created_at: "2026-08-07T17:06:57Z"
updated_at: "2026-08-07T18:39:00Z"
---

# Implementation Plan: #30 — [#26] Create community files (CONTRIBUTING, SECURITY, CoC)

> **#27 has merged** (`5f01082`, 2026-08-07) and this branch is fast-forwarded onto
> it. Step 1's blocking check is satisfied — verified below. The dependency note is
> kept for the record.
>
> **#60 (flip repository to public) must merge after this issue and #31.**

## Post-#27 state (verified on this branch)

| Fact | Value | Consequence for this plan |
|---|---|---|
| `package.json` `version` | `0.0.0-development` | marquee's Releases wording is now literally true here |
| `package.json` `license` | **`Apache-2.0`** | AC-5 changed — the relicense already happened, so naming the license is safe |
| `package.json` `engines.node` | `>=24.0.0` | AC-3 unchanged |
| `CHANGELOG.md` | **deleted** | AC-4 unchanged |
| `.releaserc.json` plugins | `commit-analyzer`, `release-notes-generator`, `npm`, `exec`, `github` | **`@semantic-release/changelog` was removed too** — the earlier draft of this plan said it stayed. Release notes come from `release-notes-generator` into the GitHub Release body |
| `LICENSE` / `NOTICE` | Apache-2.0 + NOTICE, both in `package.json` `files` | New material for CONTRIBUTING's License section |
| Test suite | **188 passed** (was 182; `src/__tests__/packaging.test.ts` adds 6) | Baseline for step 8 |

#27 also rewrote `CLAUDE.md`'s Releases section with the `0.0.0-development`
mechanics, the Apache-2.0 distribution artifacts, and why `packaging.test.ts`
asserts git-tracking. That content flows into `AGENTS.md` at step 2 and is the
best source for CONTRIBUTING's Releases section — prefer it over marquee's.

Discovery session that produced this plan:
`.cothinker/session-2026-08-07-30-create-community-files.md` (gitignored).

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | create | `CONTRIBUTING.md` | Human-facing contribution guide. marquee's section order, npm commands, Node >= 24 |
| 2 | create | `SECURITY.md` | Security policy. Private Vulnerability Reporting + `security@refokus.com` fallback |
| 3 | create | `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1, contact `packages@refokus.com` |
| 4 | `git mv` | `CLAUDE.md` → `AGENTS.md` | Tool-agnostic repo conventions. `git mv` preserves blame |
| 5 | create | `CLAUDE.md` | `@AGENTS.md` import plus a `## Claude Code` section (empty today) |
| 6 | modify | `README.md` | New `## Contributing` section immediately before `## License` |
| 7 | modify | `.gitignore` | `.cothinker/` entry — added during planning; keep it or revert deliberately |

## Codebase Context

**Reference material** (downloaded verbatim during planning, in the session scratchpad):
`ref/marquee/{CONTRIBUTING,SECURITY,CODE_OF_CONDUCT}.md`,
`ref/navigation/{CONTRIBUTING,SECURITY,CODE_OF_CONDUCT}.md`,
`ref/platform-CODE_OF_CONDUCT.md`.

**Modules and patterns to respect:**

- `package.json` `scripts` — 14 entries, all verified: `build`, `build:clean`,
  `build:watch`, `prepublishOnly`, `check-types`, `lint`, `lint:report`,
  `format`, `test`, `test:watch`, `test:coverage`, `test:ui`, `bench`, `commit`.
  marquee's `CONTRIBUTING.md` documents a `typecheck` script that **does not
  exist here** — do not copy it.
- `npm run lint` carries `--fix` and mutates `src/`. `npm run lint:report` is the
  read-only variant. Same split as marquee; document both and say which is which.
- `.cz.json` → `cz-conventional-changelog`. `npm run commit` is the wizard. There
  is no commitlint config and no commit-msg hook, so conventions are review-enforced
  only — marquee says this explicitly and it is equally true here.
- `.nvmrc` is `v24.14.0`. `engines.node` is `>=24.0.0` (settled in #27).
- `tsconfig.json` sets `rewriteRelativeImportExtensions: true`, so the explicit
  `.ts` import convention is compiler-enforced, not just style. Worth calling out
  as a first-contributor gotcha.
- `README.md` uses ATX headings in sentence case, no trailing punctuation, and
  ends with a two-line `## License` section. Match that terseness.
- CI delegates to `refokus-agency/platform/.github/workflows/ci.yml@v1`, which
  defaults `node-version` to `'24'` and does not read `.nvmrc`.

**Reference-repo divergences that must NOT be copied:**

| marquee says | This repo |
|---|---|
| pnpm, `pnpm-lock.yaml`, `--frozen-lockfile` | npm, `package-lock.json` |
| GSAP >= 3.12.0 peer dependency | none |
| Biome (`biome.json`) | ESLint + Prettier (#52 migrates to Biome later) |
| `AGENTS.md` companion | `AGENTS.md` after step 2 of this plan |
| Node >= 22.0.0 | **Node >= 24** |
| `pnpm typecheck` | no such script |

## Steps

1. ~~**Confirm #27 has merged.**~~ **DONE** — branch fast-forwarded to `5f01082`.
   `version` is `0.0.0-development`, `CHANGELOG.md` is gone, `@semantic-release/git`
   is absent, 188/188 tests pass. (When grepping the plugin list, match
   `"@semantic-release/git"` with the quotes — a bare `semantic-release/git`
   pattern also matches `@semantic-release/github`.)

2. **`git mv CLAUDE.md AGENTS.md`.** Content unchanged.
   **Done when:** `git log --follow AGENTS.md` shows commits predating the move.

3. **Write the new `CLAUDE.md`:** first line `@AGENTS.md`, then an empty
   `## Claude Code` section.
   **Done when:** the file is ≤ 5 lines and its first line is exactly `@AGENTS.md`.

4. **Write `CODE_OF_CONDUCT.md`** from `ref/marquee/CODE_OF_CONDUCT.md`, swapping
   only the contact address. Keep the attribution and CC BY-SA 4.0 block intact.
   **Done when:** `rg 'packages@refokus.com' CODE_OF_CONDUCT.md` matches and
   `rg 'security@|tomas@' CODE_OF_CONDUCT.md` returns nothing.

5. **Write `SECURITY.md`** from `ref/marquee/SECURITY.md`, swapping package name
   and advisory URL, dropping the GSAP mention from the environment line.
   **Done when:** `rg -i 'gsap|marquee' SECURITY.md` returns nothing.

6. **Write `CONTRIBUTING.md`** with the ten sections in marquee's order, all
   commands in npm, Node >= 24, Releases with no tracked changelog, License
   linking `LICENSE` and naming Apache-2.0, and `AGENTS.md` linked as the
   agent-facing companion. Source the Releases section from `AGENTS.md`'s own
   Releases text (written by #27), not from marquee's.
   **Done when:** every command in the file resolves to a `package.json` script
   or an `npx vitest` invocation.

7. **Add `## Contributing` to `README.md`**, immediately before `## License`,
   linking all three community files.
   **Done when:** all three relative links resolve to existing files.

8. **Run the documented verification chain.**
   **Done when:** `npm test && npm run check-types && npm run lint:report && npm run build`
   exits 0.

## Interfaces

N/A — this change introduces no code, types, or data structures. No interfaces
are invented to fill this section.

## Function Design

N/A — documentation-only change. No functions are added or modified.

## Acceptance Criteria (EARS)

- **AC-1** — `CONTRIBUTING.md` shall exist at the repository root with top-level
  sections in exactly this order: How to Contribute, Development Setup,
  Submitting Issues, Submitting Pull Requests, Code Style, Commit Conventions,
  Releases, Response Time, Code of Conduct, License.
- **AC-2** — Every command documented in `CONTRIBUTING.md` shall exist in
  `package.json` `scripts` or be an `npx vitest` invocation.
- **AC-3** — `CONTRIBUTING.md` shall state Node >= 24 as the required floor.
- **AC-4** — The Releases section shall state that release notes live in the
  GitHub Release body and shall not reference a tracked `CHANGELOG.md`.
- **AC-5** — The License section shall link `LICENSE` and name **Apache-2.0**,
  matching `package.json` `license`. *(Changed after #27 merged: the original
  criterion said "without naming a specific license", written defensively while
  the MIT → Apache-2.0 relicense was still pending. It has landed, so the hedge is
  obsolete and naming the license is more useful.)*
- **AC-6** — `SECURITY.md` shall declare latest-only support, Private
  Vulnerability Reporting at
  `https://github.com/refokus-agency/feature-engine/security/advisories/new`,
  fallback `security@refokus.com` with subject
  `[SECURITY] @refokus-agency/feature-engine`, and a 5-business-day
  acknowledgement target.
- **AC-7** — If Private Vulnerability Reporting is not yet enabled, then the
  advisory link returning 404 shall not be treated as a failure of this change.
- **AC-8** — `CODE_OF_CONDUCT.md` shall be Contributor Covenant v2.1 with contact
  `packages@refokus.com`, with its attribution and CC BY-SA 4.0 block intact.
- **AC-9** — `AGENTS.md` shall contain the content of the pre-change root
  `CLAUDE.md`.
- **AC-10** — `CLAUDE.md` shall consist of an `@AGENTS.md` import plus a
  `## Claude Code` section.
- **AC-11** — When Claude Code starts a session in this repository, `/context`
  shall list `CLAUDE.md` under Memory files with the `AGENTS.md` content loaded.
- **AC-12** — `README.md` shall link `CONTRIBUTING.md`, `SECURITY.md`, and
  `CODE_OF_CONDUCT.md`.
- **AC-13** — If `rg -i 'pnpm|gsap|biome'` matches any file created by this
  change, then the change shall be treated as incomplete.
- **AC-14** — Every relative markdown link introduced by this change shall
  resolve to an existing path.

## Out of Scope

- `LICENSE`, `NOTICE`, `package.json` metadata, the `license` field → **#27 (merged)**.
  Do not touch these files.
- `.github/ISSUE_TEMPLATE/`, `pull_request_template.md`, README badges → **#31**
- Enabling Private Vulnerability Reporting in repo settings → **#57**
- Rewriting the README for an open-source audience → **#29** (this issue adds one
  section only)
- Upgrading the Code of Conduct to Contributor Covenant v3.0 → **#62**
  (siblings: marquee#81, navigation#64, platform#61)
- Migrating ESLint + Prettier to Biome → **#52**

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | #30 merges before #27 | [from issue] | Blocked by step 1. AC-3 and AC-4 would document a state that does not exist |
| 2 | Advisory link 404s because PVR is off | [from issue] | AC-7. Tracked in #57, not a failure of this change |
| 3 | `/issues/new/choose` linked before #31 lands | [inferred] | Repo is private until #60, so no external reader can hit it. Whether the URL 404s or redirects was not verified |
| 4 | The `@AGENTS.md` import silently fails | [inferred] | AC-11 verifies via `/context`. Without it, agents lose every convention at once |
| 5 | #52 migrates to Biome, making Code Style stale | [inferred] | Document ESLint + Prettier as they exist today; #52 updates the section |
| 6 | #29 rewrites the README and drops the new section | [inferred] | Keep the edit minimal — one section, one anchor point (before `## License`) |
| 7 | CoC copied without its CC BY-SA attribution | [inferred] | AC-8 makes it explicit; the license requires attribution |
| 8 | marquee documents `pnpm typecheck`, which has no equivalent here | [inferred] | AC-2 validates every command against `package.json` |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| `CONTRIBUTING.md` | AC-1, AC-2, AC-3, AC-4, AC-5, AC-13, AC-14 |
| `SECURITY.md` | AC-6, AC-7, AC-13 |
| `CODE_OF_CONDUCT.md` | AC-8, AC-13 |
| `AGENTS.md` + `CLAUDE.md` | AC-9, AC-10, AC-11 |
| README links | AC-12, AC-14 |

## Risks

| Risk | Mitigation |
|------|------------|
| ~~Merging before #27~~ | **Resolved** — #27 merged, branch fast-forwarded |
| `CLAUDE.md` becomes a one-line file — if the import breaks, every convention is lost silently | AC-11 is mandatory, not optional. Verify with `/context` before opening the PR |
| Copying marquee verbatim drags in pnpm, GSAP, Biome, and a non-existent `typecheck` script | AC-2 and AC-13 are the guardrails; run both before the PR |
| ~~`.cothinker/` added to `.gitignore` during planning~~ | **Resolved** — #27's `10da4fd` already ignores `.atl` and `.cothinker`. The local edit was redundant and has been discarded; the working tree now matches `origin/main` |
| ~~`.atl/` untracked~~ | **Resolved** — gitignored by #27 |
| CONTRIBUTING's Code Style section documents ESLint + Prettier, which #52 replaces with Biome | Accept the churn. Describe what exists today; #52 owns the update |

## Test Strategy

No unit tests — the change adds no code. Verification is by executable assertion:

```bash
# AC-2: every documented command actually runs
npm test && npm run check-types && npm run lint:report && npm run build

# AC-13: nothing inherited from the reference repos
rg -i 'pnpm|gsap|biome' CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md AGENTS.md

# AC-8: correct CoC version and contact
rg 'version/2/1' CODE_OF_CONDUCT.md
rg 'packages@refokus.com' CODE_OF_CONDUCT.md
rg 'security@|tomas@' CODE_OF_CONDUCT.md      # must return nothing

# AC-5: License section names Apache-2.0 and never MIT
rg 'Apache-2.0' CONTRIBUTING.md
rg -i '\bMIT\b' CONTRIBUTING.md               # must return nothing

# AC-9: history preserved across the rename
git log --follow AGENTS.md | head

# AC-1: section order
rg '^## ' CONTRIBUTING.md
```

**AC-14** — extract every `[text](target)` from the new files and assert each
relative `target` exists on disk.

**AC-11** — manual: open a Claude Code session at the repo root and run
`/context`; confirm `CLAUDE.md` appears under Memory files and the `AGENTS.md`
content is present. This is the one criterion that cannot be scripted.

**AC-7** — not verifiable in this change. Confirm after #57 enables Private
Vulnerability Reporting.
