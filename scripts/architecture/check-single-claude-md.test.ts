import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findNestedClaudeMd } from './check-single-claude-md';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: string[]): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'single-claude-md-'));
  testDirs.push(rootDir);

  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, '# rules\n');
  }

  return rootDir;
}

describe('single CLAUDE.md guard', () => {
  it('accepts the root CLAUDE.md and ignores dependencies and worktrees', () => {
    const rootDir = fixture([
      'CLAUDE.md',
      'apps/app/AGENTS.md',
      'node_modules/some-package/CLAUDE.md',
      '.worktrees/feature/CLAUDE.md',
    ]);

    expect(findNestedClaudeMd({ rootDir })).toEqual([]);
  });

  it('rejects CLAUDE.md files below the root', () => {
    const rootDir = fixture([
      'CLAUDE.md',
      'apps/app/CLAUDE.md',
      'packages/ui/src/CLAUDE.md',
    ]);

    expect(findNestedClaudeMd({ rootDir })).toEqual([
      'apps/app/CLAUDE.md',
      'packages/ui/src/CLAUDE.md',
    ]);
  });
});
