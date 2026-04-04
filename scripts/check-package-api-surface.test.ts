import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPackageSnapshot,
  collectMigrationNotePackageDirs,
  comparePackageSnapshots,
} from './check-package-api-surface';

describe('check-package-api-surface', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'package-api-surface-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('uses explicit package exports when a manifest is present', () => {
    writeFixture(
      'packages/agent/package.json',
      JSON.stringify(
        {
          exports: {
            '.': {
              types: './src/index.ts',
            },
            './widgets/*': {
              types: './src/widgets/*',
            },
          },
          name: '@genfeedai/agent',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );
    writeFixture('packages/agent/src/index.ts', 'export const root = 1;');
    writeFixture(
      'packages/agent/src/widgets/button.ts',
      'export interface ButtonProps { label: string; }',
    );

    const snapshot = buildPackageSnapshot(
      'packages/agent',
      createDiskAccessor(testDir),
    );

    expect(snapshot.modules.map((module) => module.specifier)).toEqual([
      '.',
      './widgets/button',
    ]);
  });

  it('falls back to file-based modules for packages without manifests', () => {
    writeFixture('packages/pages/home/index.ts', 'export const HomePage = 1;');
    writeFixture(
      'packages/pages/shared/card.tsx',
      'export function Card() { return null; }',
    );

    const snapshot = buildPackageSnapshot(
      'packages/pages',
      createDiskAccessor(testDir),
    );

    expect(snapshot.modules.map((module) => module.specifier)).toEqual([
      './home',
      './shared/card',
    ]);
  });

  it('fails public API diffs without a version bump or migration note', () => {
    const baseSnapshots = [
      {
        modules: [
          {
            filePath: 'packages/ui/src/index.ts',
            hash: 'base',
            signature: 'export declare const button: string;',
            specifier: '.',
          },
        ],
        packageDir: 'packages/ui',
        packageName: '@genfeedai/web-ui',
        version: '1.0.0',
      },
    ];
    const currentSnapshots = [
      {
        modules: [
          {
            filePath: 'packages/ui/src/index.ts',
            hash: 'current',
            signature: 'export declare const button: number;',
            specifier: '.',
          },
        ],
        packageDir: 'packages/ui',
        packageName: '@genfeedai/web-ui',
        version: '1.0.0',
      },
    ];

    const diffs = comparePackageSnapshots(baseSnapshots, currentSnapshots);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.hasVersionBump).toBe(false);
    expect(diffs[0]?.hasMigrationNote).toBe(false);
    expect(diffs[0]?.changedModules[0]?.kind).toBe('changed');
  });

  it('accepts migration notes that declare package coverage', () => {
    writeFixture(
      '.changes/web-ui-public-api.md',
      ['# Public API note', '', 'packages: ui'].join('\n'),
    );

    const packageDirs = collectMigrationNotePackageDirs(
      testDir,
      ['.changes/web-ui-public-api.md'],
      new Set(['packages/ui']),
    );

    expect(packageDirs.has('packages/ui')).toBe(true);
  });

  it('accepts version bumps for changed package surfaces', () => {
    const baseSnapshots = [
      {
        modules: [
          {
            filePath: 'packages/helpers/src/index.ts',
            hash: 'base',
            signature: 'export declare const value: string;',
            specifier: '.',
          },
        ],
        packageDir: 'packages/helpers',
        packageName: '@genfeedai/helpers',
        version: '2.2.8',
      },
    ];
    const currentSnapshots = [
      {
        modules: [
          {
            filePath: 'packages/helpers/src/index.ts',
            hash: 'current',
            signature: 'export declare const value: number;',
            specifier: '.',
          },
        ],
        packageDir: 'packages/helpers',
        packageName: '@genfeedai/helpers',
        version: '2.2.9',
      },
    ];

    const diffs = comparePackageSnapshots(baseSnapshots, currentSnapshots);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.hasVersionBump).toBe(true);
  });
});

function createDiskAccessor(rootDir: string) {
  return {
    exists(filePath: string): boolean {
      return pathExists(path.join(rootDir, filePath));
    },
    listPackageFiles(packageDir: string): string[] {
      return walk(path.join(rootDir, packageDir));
    },
    readFile(filePath: string): string | null {
      const absolutePath = path.join(rootDir, filePath);
      return pathExists(absolutePath)
        ? readFileSync(absolutePath, 'utf8')
        : null;
    },
  };
}

function pathExists(targetPath: string): boolean {
  return existsSync(targetPath);
}

function walk(targetDir: string, base = ''): string[] {
  if (!pathExists(targetDir)) {
    return [];
  }

  const entries = readdirSync(targetDir, {
    withFileTypes: true,
  }) as Array<{ isDirectory(): boolean; name: string }>;
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = base ? path.posix.join(base, entry.name) : entry.name;
    const absolutePath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(absolutePath, relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function writeFixture(relativePath: string, content: string): void {
  const absolutePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
}
