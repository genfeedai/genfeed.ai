import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCleanWorkingTree,
  normalizeReleaseRequests,
  registryAction,
  sortReleaseRequests,
  validatePackedPackage,
} from '../publish-packages-from-json.mjs';

describe('publish package release planning', () => {
  it('requires exact PR-merged versions and rejects live bump requests', () => {
    const inventory = inventoryFor([
      packageEntry('packages/enums', '@genfeedai/enums', '2.3.2'),
    ]);

    expect(() =>
      normalizeReleaseRequests(
        [{ bump: 'patch', path: 'packages/enums' }],
        inventory,
      ),
    ).toThrow('version changes must merge through a PR');
    expect(() =>
      normalizeReleaseRequests(
        [{ path: 'packages/enums', version: '2.3.3' }],
        inventory,
      ),
    ).toThrow('master contains 2.3.2');
  });

  it('rejects paths outside the direct OSS packages directory', () => {
    const inventory = inventoryFor([]);
    expect(() =>
      normalizeReleaseRequests(
        [{ path: 'ee/packages/billing', version: '1.0.0' }],
        inventory,
      ),
    ).toThrow('must be a direct package directory under packages/');
  });

  it('sorts requests dependency-first regardless of input order', () => {
    const enums = packageEntry('packages/enums', '@genfeedai/enums', '2.3.2');
    const constants = packageEntry(
      'packages/constants',
      '@genfeedai/constants',
      '2.2.9',
      { '@genfeedai/enums': 'workspace:*' },
    );
    const interfaces = packageEntry(
      'packages/interfaces',
      '@genfeedai/interfaces',
      '2.3.20',
      {
        '@genfeedai/constants': 'workspace:*',
        '@genfeedai/enums': 'workspace:*',
      },
    );
    const inventory = inventoryFor([interfaces, constants, enums]);
    const requests = normalizeReleaseRequests(
      [
        { path: interfaces.path, version: interfaces.pkg.version },
        { path: constants.path, version: constants.pkg.version },
        { path: enums.path, version: enums.pkg.version },
      ],
      inventory,
    );

    expect(
      sortReleaseRequests(requests, inventory).map((entry) => entry.name),
    ).toEqual([
      '@genfeedai/enums',
      '@genfeedai/constants',
      '@genfeedai/interfaces',
    ]);
  });

  it('rejects dependency cycles before any build or publish', () => {
    const first = packageEntry('packages/first', '@genfeedai/first', '1.0.0', {
      '@genfeedai/second': 'workspace:*',
    });
    const second = packageEntry(
      'packages/second',
      '@genfeedai/second',
      '1.0.0',
      { '@genfeedai/first': 'workspace:*' },
    );
    const inventory = inventoryFor([first, second]);
    const requests = normalizeReleaseRequests(
      [
        { path: first.path, version: first.pkg.version },
        { path: second.path, version: second.pkg.version },
      ],
      inventory,
    );

    expect(() => sortReleaseRequests(requests, inventory)).toThrow(
      'dependency cycle',
    );
  });

  it('validates resolved workspace versions and packed entry points', () => {
    const dependency = packageEntry(
      'packages/enums',
      '@genfeedai/enums',
      '2.3.2',
    );
    const request = packageEntry(
      'packages/constants',
      '@genfeedai/constants',
      '2.2.9',
      { '@genfeedai/enums': 'workspace:*' },
    );
    const inventory = inventoryFor([dependency, request]);

    expect(() =>
      validatePackedPackage({
        archiveFiles: [
          'package/LICENSE',
          'package/package.json',
          'package/dist/index.d.ts',
          'package/dist/index.js',
        ],
        inventory,
        packedManifest: {
          dependencies: { '@genfeedai/enums': 'workspace:*' },
          exports: {
            '.': {
              default: './dist/index.js',
              types: './dist/index.d.ts',
            },
          },
          name: request.pkg.name,
          version: request.pkg.version,
        },
        request: {
          ...request,
          name: request.pkg.name,
          version: request.pkg.version,
        },
      }),
    ).toThrow('retained workspace:*');
  });

  it('requires a license payload in every tarball', () => {
    const request = packageEntry('packages/enums', '@genfeedai/enums', '2.3.2');
    const inventory = inventoryFor([request]);

    expect(() =>
      validatePackedPackage({
        archiveFiles: ['package/package.json', 'package/dist/index.js'],
        inventory,
        packedManifest: {
          name: request.pkg.name,
          version: request.pkg.version,
        },
        request: {
          ...request,
          name: request.pkg.name,
          version: request.pkg.version,
        },
      }),
    ).toThrow('tarball is missing LICENSE');
  });

  it('rejects platform metadata from repacked tarballs', () => {
    const request = packageEntry('packages/enums', '@genfeedai/enums', '2.3.2');
    const inventory = inventoryFor([request]);

    expect(() =>
      validatePackedPackage({
        archiveFiles: [
          'package/LICENSE',
          'package/._LICENSE',
          'package/package.json',
        ],
        inventory,
        packedManifest: {
          name: request.pkg.name,
          version: request.pkg.version,
        },
        request: {
          ...request,
          name: request.pkg.name,
          version: request.pkg.version,
        },
      }),
    ).toThrow('tarball includes macOS metadata');
  });

  it('rejects non-ignored untracked files before artifact preparation', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'package-release-git-'));
    try {
      writeFileSync(path.join(root, 'tracked.txt'), 'tracked\n');
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Package Test',
          '-c',
          'user.email=package-test@example.com',
          'commit',
          '--quiet',
          '-m',
          'fixture',
        ],
        { cwd: root },
      );

      expect(() => assertCleanWorkingTree(root)).not.toThrow();
      mkdirSync(path.join(root, 'packages', 'fixture', 'src'), {
        recursive: true,
      });
      writeFileSync(
        path.join(root, 'packages', 'fixture', 'src', 'injected.ts'),
        'export const injected = true;\n',
      );
      expect(() => assertCleanWorkingTree(root)).toThrow('untracked files');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('resumes only when an existing registry tarball matches the plan', () => {
    expect(registryAction('sha256-matching', null)).toBe('publish');
    expect(registryAction('sha256-matching', 'sha256-matching')).toBe('skip');
    expect(() => registryAction('sha256-expected', 'sha256-different')).toThrow(
      'does not match the plan',
    );
  });
});

function packageEntry(
  packagePath: string,
  name: string,
  version: string,
  dependencies: Record<string, string> = {},
) {
  return {
    manifestPath: `${packagePath}/package.json`,
    packageDir: packagePath,
    path: packagePath,
    pkg: {
      dependencies,
      name,
      publishConfig: { access: 'public' },
      version,
    },
  };
}

function inventoryFor(packages: ReturnType<typeof packageEntry>[]) {
  return {
    byName: new Map(packages.map((entry) => [entry.pkg.name, entry])),
    byPath: new Map(packages.map((entry) => [entry.path, entry])),
    packages,
  };
}
