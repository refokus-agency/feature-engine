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
