import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Packaging guard for the files Apache-2.0 requires us to distribute.
 *
 * `npm pack` does not error when a plain filename listed in `files` is missing
 * from the working tree — it omits the file silently. And `npm pack --dry-run`
 * reads the working tree, not git, so a file that exists locally but was never
 * committed passes every local check and then disappears on a clean checkout.
 * These assertions close that gap: each legal file must be declared in the
 * manifest, present on disk, and tracked by git.
 */

const repoRoot = process.cwd();
const REQUIRED_LEGAL_FILES = ['LICENSE', 'NOTICE'] as const;

/**
 * GitHub only renders an issue form or PR template that is committed — a file
 * present locally but untracked leaves the "New issue" page silently blank.
 * Same failure class as the legal files above, so the same guard applies.
 */
const REQUIRED_GITHUB_TEMPLATES = [
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md',
] as const;

/**
 * Repo-config files under `.github/` — same silent-failure class as the
 * templates above (GitHub ignores what is not committed), but not templates,
 * so they are guarded separately.
 */
const REQUIRED_GITHUB_CONFIG = ['.github/dependabot.yml'] as const;

/**
 * The `cooldown` floor on the npm ecosystem block. Stated once here so the
 * assertion below has a single source. The matching install-time floor is
 * tracked in #72.
 */
const DEPENDABOT_COOLDOWN_DAYS = 3;

/**
 * Line that opens the `github-actions` entry. Splitting the raw config here lets
 * each ecosystem block be asserted separately without a YAML parser — a
 * file-wide match would accept `cooldown` sitting under `github-actions`, where
 * GitHub ignores it, while the npm block carries no floor at all.
 */
const DEPENDABOT_GITHUB_ACTIONS_ENTRY =
  '- package-ecosystem: "github-actions"';

/**
 * Package names that would pull a YAML parser into the toolchain. The
 * Dependabot assertions below are deliberately raw-text so none of these is
 * needed — this list keeps that decision enforced rather than aspirational.
 */
const YAML_PARSER_PACKAGES = [
  'yaml',
  'js-yaml',
  'yamljs',
  'yaml-js',
  '@types/js-yaml',
] as const;

const EXPECTED_KEYWORDS = [
  'webflow',
  'feature-loading',
  'code-splitting',
  'vite',
  'typescript',
  'lazy-loading',
  'esm',
  'browser',
  'dependency-graph',
] as const;

function isTrackedByGit(file: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

describe('packaging — required legal files', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  ) as { files: string[] };

  for (const file of REQUIRED_LEGAL_FILES) {
    it(`declares ${file} in the package.json files array`, () => {
      expect(manifest.files).toContain(file);
    });

    it(`has ${file} present on disk`, () => {
      expect(existsSync(resolve(repoRoot, file))).toBe(true);
    });

    it(`has ${file} tracked by git, not just present locally`, () => {
      expect(isTrackedByGit(file)).toBe(true);
    });
  }

  it('declares exactly the expected keyword set', () => {
    const { keywords } = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
    ) as { keywords: string[] };

    expect(keywords).toEqual([...EXPECTED_KEYWORDS]);
  });
});

describe('packaging — GitHub templates', () => {
  for (const file of REQUIRED_GITHUB_TEMPLATES) {
    it(`has ${file} present on disk`, () => {
      expect(existsSync(resolve(repoRoot, file))).toBe(true);
    });

    it(`has ${file} tracked by git, not just present locally`, () => {
      expect(isTrackedByGit(file)).toBe(true);
    });
  }
});

describe('packaging — Dependabot config', () => {
  for (const file of REQUIRED_GITHUB_CONFIG) {
    it(`has ${file} present on disk`, () => {
      expect(existsSync(resolve(repoRoot, file))).toBe(true);
    });

    it(`has ${file} tracked by git, not just present locally`, () => {
      expect(isTrackedByGit(file)).toBe(true);
    });
  }

  /**
   * The assertion with teeth. Re-syncing this config from another repo drops
   * the `cooldown` block — none of the reference configs carry one — and the
   * 3-day floor would disappear with nothing else noticing.
   *
   * The floor is pinned to the npm block, and the `github-actions` block is
   * asserted to carry no `cooldown` key at all: `cooldown` is unsupported for
   * that ecosystem, so a floor that drifts into it is silently ignored by
   * GitHub while reading as if the policy were still in force.
   */
  it(`keeps the ${DEPENDABOT_COOLDOWN_DAYS}-day cooldown floor on the npm ecosystem`, () => {
    const config = readFileSync(
      resolve(repoRoot, '.github/dependabot.yml'),
      'utf8',
    );
    const splitAt = config.indexOf(DEPENDABOT_GITHUB_ACTIONS_ENTRY);

    expect(splitAt).toBeGreaterThan(-1);

    // `\s*$` rather than `\b` so the day count is matched as a whole value —
    // `\b` also accepts `3.5`, `3,` and any other non-word suffix.
    expect(config.slice(0, splitAt)).toMatch(
      new RegExp(
        `cooldown:\\s*\\n\\s*default-days:\\s*${DEPENDABOT_COOLDOWN_DAYS}\\s*$`,
        'm',
      ),
    );
    expect(config.slice(splitAt)).not.toMatch(/^\s*cooldown:/m);
  });

  it('asserts on the config without a YAML-parsing devDependency', () => {
    const { devDependencies } = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
    ) as { devDependencies: Record<string, string> };

    expect(
      YAML_PARSER_PACKAGES.filter((pkg) => pkg in devDependencies),
    ).toEqual([]);
  });
});

describe('packaging — README badges', () => {
  const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');

  it('references the pr-ci.yml workflow in the CI badge', () => {
    expect(readme).toContain(
      'https://github.com/refokus-agency/feature-engine/actions/workflows/pr-ci.yml/badge.svg',
    );
  });

  /**
   * Anchored to the exact lines, not searched for anywhere in the file: the
   * badges have to sit directly under the H1 to render in GitHub's header area.
   * A whole-file substring search passes just as happily with the badges
   * appended to the bottom of the README, which is the failure this guards.
   */
  it('places the badges on lines 3-5, in CI, npm version, License order', () => {
    const lines = readme.split('\n');

    expect(lines[0]).toMatch(/^# /);
    expect(lines.slice(2, 5)).toEqual([
      expect.stringContaining('![CI]'),
      expect.stringContaining('![npm version]'),
      expect.stringContaining('![License: Apache-2.0]'),
    ]);
  });
});
