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
});
