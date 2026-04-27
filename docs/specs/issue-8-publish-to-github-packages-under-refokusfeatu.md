---
issue_number: 8
issue_title: "Publish to GitHub Packages under @refokus/feature-engine"
repo: "refokus-agency/feature-engine"
labels: [enhancement]
plan_level: "standard"
depth: "medium"
branch_name: "feat/8-publish-to-github-packages"
created_at: "2026-04-27T12:00:00Z"
---

# Implementation Plan: #8 — Publish to GitHub Packages under @refokus/feature-engine

## Files

| # | Action | Path | Purpose |
|---|--------|------|---------|
| 1 | modify | `tsconfig.json` | Exclude test files from tsc build to prevent dist/__tests__/ leak |
| 2 | modify | `.releaserc.json` | Add @semantic-release/exec (npm pack) + update @semantic-release/github with .tgz asset upload |
| 3 | modify | `.github/workflows/release-package-version.yml` | Add @semantic-release/exec to extra_plugins, bump semantic_version to 24 |
| 4 | modify | `.npmignore` | Fix map glob to **/*.map, add __tests__/ defense-in-depth exclusion |

## Codebase Context

- **Build toolchain:** tsc only — `vite.config.ts` is exclusively for vitest, not for building
- **Tarball inclusion:** controlled by `package.json` `files` whitelist (primary) + `.npmignore` (secondary additive excludes)
- **Auth strategy:** single `GH_PAT_TOKEN` secret used for both git operations and npm registry authentication
- **Versioning:** semantic-release drives all versioning and publishing — no manual `npm publish` needed
- **Marquee reference:** `refokus-agency/marquee` uses `@semantic-release/exec` to run `npm pack` and `@semantic-release/github` to upload `.tgz` as a GitHub Release asset — this is the pattern to follow
- **Dual subpath exports:** `.` (runtime: defineFeature, loadFeatures, types) and `./vite` (Vite plugin). Both produce `.js` + `.d.ts` in dist

## Steps

### Step 1: Fix tsconfig.json — exclude test files from build

Add `src/**/*.test.ts` to the `exclude` array. Currently only `src/**/*.spec.ts` is excluded, but all tests use the `.test.ts` convention. This prevents `dist/__tests__/` from being generated.

**Done when:** `npm run build:clean` produces no `dist/__tests__/` directory

### Step 2: Update .releaserc.json — add exec plugin and github assets

Add `@semantic-release/exec` with `publishCmd: "npm pack"` after `@semantic-release/npm`. Update `@semantic-release/github` to include `.tgz` asset upload. Keep `@semantic-release/git` in place (already present).

Plugin order:
1. `@semantic-release/commit-analyzer`
2. `@semantic-release/release-notes-generator`
3. `@semantic-release/changelog`
4. `@semantic-release/npm`
5. `["@semantic-release/exec", {"publishCmd": "npm pack"}]`
6. `@semantic-release/git`
7. `["@semantic-release/github", {"assets": [{"path": "*.tgz", "label": "npm package tarball"}]}]`

**Done when:** `.releaserc.json` has exec plugin between npm and git, and github plugin has assets array with `*.tgz`

### Step 3: Update workflow — add exec plugin and bump semantic-release version

In `.github/workflows/release-package-version.yml`:
- Add `@semantic-release/exec` to `extra_plugins`
- Change `semantic_version: 22` to `semantic_version: 24` (matching marquee)

**Done when:** workflow has `@semantic-release/exec` in extra_plugins and `semantic_version` is `24`

### Step 4: Fix .npmignore — update map glob and add test exclusion

- Change `*.map` to `**/*.map` so it catches `dist/**/*.map` (defense-in-depth)
- Add `__tests__/` to exclude compiled test directories

**Done when:** `.npmignore` has `**/*.map` and `__tests__/` entries

### Step 5: Verify tarball and run tests

- `npm run build:clean` — verify no `dist/__tests__/`
- `npm pack --dry-run` — verify 0 test files, 0 .map files, both exports present
- `npm test` — all existing tests pass

**Done when:** tarball contains only `.js`, `.d.ts`, `README.md`, `LICENSE`, `package.json` and all tests pass

## Interfaces

N/A — configuration-only changes, no new types or interfaces.

## Function Design

N/A — no application code changes.

## Acceptance Criteria (EARS)

- **AC-1.** [from issue] The package shall be published to GitHub Packages under the `@refokus-agency` scope.
- **AC-2.** [from issue] When a consumer runs `npm install @refokus-agency/feature-engine` with registry config pointing to `https://npm.pkg.github.com`, the package shall install successfully.
- **AC-3.** [from issue] `package.json` shall have correct `name`, `version`, `main`, `module`, `types`, `files`, and `publishConfig` fields.
- **AC-4.** [from issue] The `.tgz` tarball shall exclude test files and `.map` files.
- **AC-5.** [inferred/marquee] When semantic-release publishes, it shall also run `npm pack` and attach the `.tgz` tarball as an asset to the GitHub Release.
- **AC-6.** [inferred/marquee] `.releaserc.json` shall include `@semantic-release/exec` (for `npm pack`) and `@semantic-release/github` (with `.tgz` asset upload), matching marquee's pattern.
- **AC-7.** [inferred] The tarball shall include `.js` and `.d.ts` files for both the root export (`.`) and the `./vite` subpath export.

## Out of Scope

- Actually triggering a publish (requires merge to main — will happen when epic branch is merged)
- Creating/configuring the `GH_PAT_TOKEN` secret in repo settings (manual admin step)
- Consumer-side `.npmrc` setup instructions (belongs in README, tracked by issue #9)

## Edge Cases + Error Handling

| # | Scenario | Source | Handling |
|---|----------|--------|----------|
| 1 | Tests compiled to `dist/__tests__/` leak into tarball via `dist/**/*.js` glob | [inferred] | Exclude `src/**/*.test.ts` from tsconfig build |
| 2 | `*.map` glob in `.npmignore` only matches root-level files, not `dist/**/*.map` | [inferred] | Change to `**/*.map` (defense-in-depth; `files` whitelist already excludes) |
| 3 | `@semantic-release/exec` must run after `@semantic-release/npm` in plugin order | [inferred] | Place exec after npm in `.releaserc.json` plugin array |
| 4 | `GH_PAT_TOKEN` secret missing in repo settings | [inferred] | Cannot fix from code — document as prerequisite for first publish |
| 5 | Not open source — private GitHub Packages registry | [from issue] | `publishConfig.registry` → `npm.pkg.github.com` (already configured) |
| 6 | `.releaserc.json` only releases from `main` branch | [inferred] | Epic branch PRs won't trigger a release until merged — expected behavior |

## Done Criteria per Feature

| Feature | Done when |
|---------|-----------|
| Tarball hygiene | AC-4, AC-7 — no tests/maps in `npm pack --dry-run`, both exports present |
| Release pipeline | AC-1, AC-5, AC-6 — `.releaserc.json` + workflow match marquee pattern |
| Package metadata | AC-2, AC-3 — `package.json` fields verified correct |

## Risks

| Risk | Mitigation |
|------|------------|
| `GH_PAT_TOKEN` not configured in repo settings | Document as prerequisite; workflow will fail at auth step with clear error |
| `npm pack` in CI creates `.tgz` in working directory | `.tgz` files should not be committed; verify `.gitignore` covers them |

## Test Strategy

- **Build verification:** `npm run build:clean` → confirm no `dist/__tests__/` directory exists
- **Tarball verification:** `npm pack --dry-run` → confirm 0 test files, 0 `.map` files, both root and `./vite` exports present
- **Test suite:** `npm test` → all existing tests pass (no regressions from tsconfig change)
- **Workflow syntax:** manual review of YAML structure (no local CI runner needed)
