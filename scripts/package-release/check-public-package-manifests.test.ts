import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPublicPackageManifests } from '../check-public-package-manifests.mjs';

const REPOSITORY_URL = 'git+https://github.com/genfeedai/genfeed.ai.git';

describe('check-public-package-manifests', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'public-package-policy-'));
    mkdirSync(path.join(root, 'packages'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it('requires internal packages to opt out explicitly', () => {
    writePackage('agent', {
      name: '@genfeedai/agent',
      version: '1.0.0',
    });

    expect(checkPublicPackageManifests({ root }).violations).toEqual([
      'packages/agent/package.json: package must declare "private": true or a public publishConfig',
    ]);

    writePackage('agent', {
      name: '@genfeedai/agent',
      private: true,
      version: '1.0.0',
    });
    expect(checkPublicPackageManifests({ root }).violations).toEqual([]);
  });

  it('accepts canonical build-output metadata', () => {
    writePackage('enums', publicManifest('enums'));
    writePackage('client', {
      ...publicManifest('client'),
      license: 'MIT',
    });

    expect(checkPublicPackageManifests({ root })).toEqual({
      checked: 2,
      violations: [],
    });
  });

  it('rejects ambiguous license metadata', () => {
    writePackage('enums', {
      ...publicManifest('enums'),
      license: 'SEE LICENSE IN LICENSE',
    });

    expect(checkPublicPackageManifests({ root }).violations).toContain(
      'packages/enums/package.json: license must be an explicit supported SPDX identifier (AGPL-3.0, AGPL-3.0-or-later, MIT)',
    );
  });

  it('fails closed when a requested package directory does not exist', () => {
    expect(
      checkPublicPackageManifests({
        requestedDirs: ['packages/missing'],
        root,
      }).violations,
    ).toEqual([
      'packages/missing: expected a package directory under packages/',
    ]);
  });

  it('rejects private runtime dependencies and source-code tarball entries', () => {
    writePackage('private-lib', {
      name: '@genfeedai/private-lib',
      private: true,
      version: '1.0.0',
    });
    writeFixture('packages/client/src/index.ts', 'export const client = true;');
    writePackage('client', {
      ...publicManifest('client'),
      dependencies: {
        '@genfeedai/private-lib': 'workspace:*',
      },
      exports: {
        '.': './src/index.ts',
      },
      files: ['src/index.ts'],
      main: './dist/index.js',
    });

    const violations = checkPublicPackageManifests({ root }).violations;
    expect(violations).toContain(
      'packages/client/package.json: "files" includes source code instead of build output (src/index.ts)',
    );
    expect(violations).toContain(
      'packages/client/package.json: published entry points to source code (./src/index.ts)',
    );
    expect(violations).toContain(
      'packages/client/package.json: dependencies.@genfeedai/private-lib references private workspace package packages/private-lib/package.json',
    );
  });

  it('rejects a bare source directory in files', () => {
    writeFixture('packages/client/src/index.ts', 'export const client = true;');
    writePackage('client', {
      ...publicManifest('client'),
      files: ['src', 'dist'],
    });

    expect(checkPublicPackageManifests({ root }).violations).toContain(
      'packages/client/package.json: "files" includes source code instead of build output (src)',
    );
  });

  function publicManifest(directory: string) {
    return {
      exports: {
        '.': {
          default: './dist/index.js',
          types: './dist/index.d.ts',
        },
      },
      files: ['dist'],
      license: 'AGPL-3.0',
      main: './dist/index.js',
      name: `@genfeedai/${directory}`,
      publishConfig: {
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
      repository: {
        directory: `packages/${directory}`,
        type: 'git',
        url: REPOSITORY_URL,
      },
      scripts: {
        build: 'tsc --build',
      },
      types: './dist/index.d.ts',
      version: '1.0.0',
    };
  }

  function writePackage(directory: string, manifest: object): void {
    writeFixture(
      `packages/${directory}/package.json`,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  function writeFixture(relativePath: string, content: string): void {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
});
