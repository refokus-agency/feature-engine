---
issue_number: 8
issue_title: "Publish to GitHub Packages under @refokus/feature-engine"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/8-publish-github-packages"
created_at: "2026-04-27T00:00:00Z"
---

# Implementation Plan: #8 — Publish to GitHub Packages under @refokus/feature-engine

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `package.json` | Rename package, update URLs, fix files/exports/keywords |
| 2 | delete | `.github/workflows/release-package-version.yml` | Replaced by platform reusable workflow |
| 3 | create | `.github/workflows/main-release.yml` | CI + semantic-release via platform reusable workflows |
| 4 | create | `.github/workflows/pr-ci.yml` | CI on PRs via platform reusable workflow |
| 5 | modify | `.npmignore` | Add *.map exclusion |

## Codebase Context

- **Navigation repo pattern**: two workflows (`main-release.yml`, `pr-ci.yml`) calling `refokus-agency/platform` reusable workflows `@v1`
- **Build system**: `tsc`-only (no Vite for library output), outputs to `dist/`
- **publishConfig.registry**: already points to `https://npm.pkg.github.com`
- **prepublishOnly script**: already runs `check-types + lint + build:clean`
- **Reference implementation**: `refokus-agency/navigation` — identical CI/CD pipeline structure

## Steps

1. **Update package.json identity and metadata** → `package.json`
   **Done when:** name is `@refokus-agency/feature-engine`, repository/bugs/homepage point to `refokus-agency/feature-engine`, files includes `!dist/**/*.map` and `!dist/**/__tests__/**`, exports drops `require` key, keywords updated, description updated

2. **Delete old workflow** → `.github/workflows/release-package-version.yml`
   **Done when:** `release-package-version.yml` no longer exists

3. **Create main-release.yml** → `.github/workflows/main-release.yml`
   **Done when:** workflow triggers on push to main + workflow_dispatch, calls `refokus-agency/platform` `ci.yml@v1` then `release.yml@v1`, has correct permissions (contents:write, packages:write, issues:write, pull-requests:write)

4. **Create pr-ci.yml** → `.github/workflows/pr-ci.yml`
   **Done when:** workflow triggers on pull_request, calls `refokus-agency/platform` `ci.yml@v1`, has permissions contents:read + packages:read

5. **Update .npmignore** → `.npmignore`
   **Done when:** `.npmignore` includes `*.map` exclusion line

## Interfaces

N/A — no new types needed, this is CI/packaging config only.

## Function Design

N/A — no application code changes.

## Acceptance Criteria (EARS)

- **AC-1.** The package.json `name` field shall be `@refokus-agency/feature-engine` [from issue]
- **AC-2.** When pushed to `main`, the `main-release.yml` workflow shall trigger CI + semantic-release using reusable workflows from `refokus-agency/platform@v1` [inferred from navigation]
- **AC-3.** When a pull request is opened, `pr-ci.yml` shall trigger CI checks using `refokus-agency/platform` `ci.yml@v1` [inferred from navigation]
- **AC-4.** The package.json `publishConfig.registry` shall point to `https://npm.pkg.github.com` [from issue]
- **AC-5.** The `files` field shall exclude `.map` files and `__tests__/` directories from the published tarball [from issue]
- **AC-6.** The package.json shall have correct `main`, `module`, `types`, and `exports` fields for ESM-only consumption (no `require` key) [from issue]
- **AC-7.** If the tarball is built via `npm pack`, it shall not contain test files or source maps [from issue]

## Out of Scope

- Creating a `.releaserc` config — navigation repo doesn't have one; platform workflow handles semantic-release defaults
- Dual CJS+ESM output — package is ESM-only matching navigation pattern
- Actually publishing the first version — that happens when this branch merges to main and the workflow runs

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Scope mismatch: issue title says `@refokus` but install AC says `@refokus-agency` | [from issue] | Use `@refokus-agency` matching org and navigation pattern |
| 2 | `secrets.GH_PAT_TOKEN` not configured in repo | [inferred] | Document as prerequisite; workflow will fail gracefully with auth error |
| 3 | CJS consumers try to `require()` the package | [inferred] | ESM-only; no `require` export key; consumers must use `import` |
| 4 | `dist/**/*.map` files currently included in tarball | [from issue] | Exclude via `files` field negation pattern `!dist/**/*.map` |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Package identity | AC-1, AC-4, AC-6 |
| CI workflows | AC-2, AC-3 |
| Tarball exclusions | AC-5, AC-7 |

## Risks

| Risk | Mitigation |
|------|------------|
| Platform reusable workflows may expect specific repo structure | Mitigated by matching navigation repo pattern exactly |
| `GH_PAT_TOKEN` secret must exist in repo settings | Document as prerequisite; cannot verify from outside |

## Test Strategy

- Run `npm pack --dry-run` locally to verify tarball excludes `.map` and test files (AC-5, AC-7)
- Verify `package.json` fields with JSON queries (AC-1, AC-4, AC-6)
- Workflow YAML validation is structural — verify correct triggers, permissions, and job references
