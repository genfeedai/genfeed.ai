import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPublishable,
  findStalePackageVersions,
  isShippedSourcePath,
  manifestShipsChange,
  planNpmRelease,
  readEnrollment,
  validateEnrollment,
} from '../npm-release-plan.mjs';
import { readPackageInventory } from '../publish-packages-from-json.mjs';

describe('npm release plan', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'npm-release-plan-'));
    mkdirSync(path.join(root, 'packages'), { recursive: true });
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it('requires every publishable package to be enrolled or excluded explicitly', () => {
    writePackage('contracts', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('actions', publicManifest('@genfeedai/actions', '0.1.4'));
    writeEnrollment({
      enrolled: ['packages/contracts'],
      excluded: {},
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/actions is publishable but is neither enrolled, dedicated nor excluded; decide explicitly',
    ]);

    writeEnrollment({
      enrolled: ['packages/contracts'],
      excluded: { 'packages/actions': 'Not ready for the public registry.' },
    });
    expect(validate().violations).toEqual([]);
  });

  it('rejects an enrolled package that depends on an excluded one', () => {
    writePackage('pricing', publicManifest('@genfeedai/pricing', '0.1.0'));
    writePackage('helpers', {
      ...publicManifest('@genfeedai/helpers', '2.2.13'),
      dependencies: { '@genfeedai/pricing': 'workspace:*' },
    });
    writeEnrollment({
      enrolled: ['packages/helpers'],
      excluded: { 'packages/pricing': 'Never published.' },
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/helpers is enrolled but dependencies.@genfeedai/pricing is excluded (packages/pricing); an enrolled package cannot depend on an unpublished one',
    ]);
  });

  it('rejects contradictory and unknown enrollment entries', () => {
    writePackage('contracts', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('agent', {
      name: '@genfeedai/agent',
      private: true,
      version: '1.0.0',
    });
    writeEnrollment({
      enrolled: ['packages/contracts', 'packages/agent'],
      excluded: {
        'packages/contracts': 'contradiction',
        'packages/ghost': '',
      },
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/agent is enrolled but is not a public package under packages/',
      'scripts/npm-release-enrollment.json: packages/contracts is both enrolled and excluded',
      'scripts/npm-release-enrollment.json: packages/ghost must document why it is excluded',
      'scripts/npm-release-enrollment.json: packages/ghost is excluded but is not a public package under packages/',
    ]);
  });

  it('plans only the enrolled versions npm has never seen', () => {
    writePackage('contracts', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('cli', publicManifest('@genfeedai/cli', '0.6.0'));
    writePackage('harness', publicManifest('@genfeedai/harness', '0.1.0'));
    writeEnrollment({
      enrolled: ['packages/cli', 'packages/contracts'],
      excluded: { 'packages/harness': 'Never published.' },
    });

    const plan = planNpmRelease({
      enrollment: readEnrollment(root),
      inventory: readPackageInventory(root),
      publishedVersions: new Map([
        ['@genfeedai/cli', new Set(['0.4.0'])],
        ['@genfeedai/contracts', new Set(['2.3.2', '2.3.3'])],
      ]),
    });

    expect(plan.publish).toEqual([
      { name: '@genfeedai/cli', path: 'packages/cli', version: '0.6.0' },
    ]);
    expect(plan.upToDate).toEqual([
      {
        name: '@genfeedai/contracts',
        path: 'packages/contracts',
        version: '2.3.3',
      },
    ]);
    expect(plan.bootstrapRequired).toEqual([]);
    expect(plan.excluded).toEqual([
      { path: 'packages/harness', reason: 'Never published.' },
    ]);
  });

  it('plans nothing when every enrolled version is already on npm', () => {
    writePackage('contracts', publicManifest('@genfeedai/contracts', '2.3.3'));
    writeEnrollment({
      enrolled: ['packages/contracts'],
      excluded: {},
    });

    const plan = planNpmRelease({
      enrollment: readEnrollment(root),
      inventory: readPackageInventory(root),
      publishedVersions: new Map([
        ['@genfeedai/contracts', new Set(['2.3.3'])],
      ]),
    });

    expect(plan.publish).toEqual([]);
    expect(() => assertPublishable(plan)).not.toThrow();
  });

  it('blocks the lane when an enrolled name does not exist on npm', () => {
    writePackage('pricing', publicManifest('@genfeedai/pricing', '0.1.0'));
    writeEnrollment({ enrolled: ['packages/pricing'], excluded: {} });

    const plan = planNpmRelease({
      enrollment: readEnrollment(root),
      inventory: readPackageInventory(root),
      publishedVersions: new Map([['@genfeedai/pricing', null]]),
    });

    expect(plan.bootstrapRequired).toEqual([
      {
        name: '@genfeedai/pricing',
        path: 'packages/pricing',
        version: '0.1.0',
      },
    ]);
    expect(plan.publish).toEqual([]);
    expect(() => assertPublishable(plan)).toThrow(
      'npm trusted publishing cannot perform a first publish',
    );
  });

  it('plans each lane on its own and never mixes them', () => {
    writePackage('cli', publicManifest('@genfeedai/cli', '0.6.0'));
    writePackage('contracts', publicManifest('@genfeedai/contracts', '0.1.0'));
    writePackage('ui', {
      ...publicManifest('@genfeedai/ui', '2.0.1'),
      dependencies: { '@genfeedai/contracts': 'workspace:*' },
    });
    writeEnrollment({
      dedicated: {
        'packages/contracts': 'publish-shared-packages.yml',
        'packages/ui': 'publish-shared-packages.yml',
      },
      enrolled: ['packages/cli'],
      excluded: {},
    });
    const publishedVersions = new Map([
      ['@genfeedai/cli', new Set(['0.6.0'])],
      ['@genfeedai/contracts', new Set(['0.0.1'])],
      ['@genfeedai/ui', new Set(['0.0.1'])],
    ]);
    const plan = (lane: string) =>
      planNpmRelease({
        enrollment: readEnrollment(root),
        inventory: readPackageInventory(root),
        lane,
        publishedVersions,
      });

    expect(validate().violations).toEqual([]);
    expect(plan('release').publish).toEqual([]);
    expect(plan('release').upToDate.map((entry) => entry.name)).toEqual([
      '@genfeedai/cli',
    ]);
    expect(plan('dedicated').publish).toEqual([
      {
        name: '@genfeedai/contracts',
        path: 'packages/contracts',
        version: '0.1.0',
      },
      { name: '@genfeedai/ui', path: 'packages/ui', version: '2.0.1' },
    ]);
    expect(() => plan('nightly')).toThrow('Unknown npm release lane');
  });

  it('rejects a package in two lanes and a dedicated package with no publisher', () => {
    writePackage('contracts', publicManifest('@genfeedai/contracts', '0.1.0'));
    writePackage('ui', publicManifest('@genfeedai/ui', '2.0.1'));
    writePackage('styles', publicManifest('@genfeedai/styles', '0.1.0'));
    writeEnrollment({
      dedicated: {
        'packages/contracts': 'publish-shared-packages.yml',
        'packages/styles': '',
        'packages/ui': 'publish-shared-packages.yml',
      },
      enrolled: ['packages/contracts'],
      excluded: { 'packages/ui': 'Held back.' },
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/contracts is both enrolled and dedicated',
      'scripts/npm-release-enrollment.json: packages/styles must name the workflow file that publishes it, such as "publish-shared-packages.yml"',
      'scripts/npm-release-enrollment.json: packages/ui is both dedicated and excluded',
    ]);
  });

  it('rejects a dedicated package that depends on an excluded one', () => {
    writePackage('pricing', publicManifest('@genfeedai/pricing', '0.1.0'));
    writePackage('ui', {
      ...publicManifest('@genfeedai/ui', '2.0.1'),
      dependencies: { '@genfeedai/pricing': 'workspace:*' },
    });
    writeEnrollment({
      dedicated: { 'packages/ui': 'publish-shared-packages.yml' },
      enrolled: [],
      excluded: { 'packages/pricing': 'Never published.' },
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/ui is dedicated but dependencies.@genfeedai/pricing is excluded (packages/pricing); a dedicated package cannot depend on an unpublished one',
    ]);
  });

  it('refuses to plan against an invalid enrollment', () => {
    writePackage('pricing', publicManifest('@genfeedai/pricing', '0.1.0'));
    writePackage('helpers', {
      ...publicManifest('@genfeedai/helpers', '2.2.13'),
      dependencies: { '@genfeedai/pricing': 'workspace:*' },
    });
    writeEnrollment({
      enrolled: ['packages/helpers'],
      excluded: { 'packages/pricing': 'Never published.' },
    });

    expect(() =>
      planNpmRelease({
        enrollment: readEnrollment(root),
        inventory: readPackageInventory(root),
        publishedVersions: new Map([['@genfeedai/helpers', new Set()]]),
      }),
    ).toThrow('npm release enrollment is invalid');
  });

  describe('version bump check', () => {
    const published = new Map([
      ['@genfeedai/ui', new Set(['2.0.0', '2.0.1'])],
      ['@genfeedai/new', null],
    ]);

    it('names a package whose shipped source changed under a version already on npm', () => {
      expect(
        findStalePackageVersions({
          packages: [
            {
              baseVersion: '2.0.1',
              headVersion: '2.0.1',
              name: '@genfeedai/ui',
              path: 'packages/ui',
              shippedFiles: ['src/primitives/button.tsx'],
            },
          ],
          publishedVersions: published,
        }),
      ).toEqual([
        '@genfeedai/ui (packages/ui): 1 shipped file(s), such as src/primitives/button.tsx changed, but version 2.0.1 is already on npm. Bump "version" in packages/ui/package.json (a patch for a fix, a minor for a feature) so the next publish carries this change.',
      ]);
    });

    it('accepts a bump, a pending bump from an earlier merge and a diff that ships nothing', () => {
      const entry = {
        name: '@genfeedai/ui',
        path: 'packages/ui',
        shippedFiles: ['src/index.ts'],
      };
      expect(
        findStalePackageVersions({
          packages: [
            { ...entry, baseVersion: '2.0.1', headVersion: '2.1.0' },
            // The base already moved to 2.1.0, which is not on npm yet.
            { ...entry, baseVersion: '2.1.0', headVersion: '2.1.0' },
            {
              ...entry,
              baseVersion: '2.0.1',
              headVersion: '2.0.1',
              shippedFiles: [],
            },
          ],
          publishedVersions: published,
        }),
      ).toEqual([]);
    });

    it('rejects a bump onto a version that is already published and skips a name npm has never seen', () => {
      expect(
        findStalePackageVersions({
          packages: [
            {
              baseVersion: '2.0.0',
              headVersion: '2.0.1',
              name: '@genfeedai/ui',
              path: 'packages/ui',
              shippedFiles: ['src/index.ts', 'src/a.ts'],
            },
            {
              baseVersion: '0.1.0',
              headVersion: '0.1.0',
              name: '@genfeedai/new',
              path: 'packages/new',
              shippedFiles: ['src/index.ts'],
            },
          ],
          publishedVersions: published,
        }),
      ).toEqual([
        '@genfeedai/ui (packages/ui): version 2.0.1 is already on npm, so it cannot carry the 2 shipped file(s), such as src/index.ts. Move "version" in packages/ui/package.json past it.',
      ]);
    });

    it('treats tests, docs and tool config as unshipped and everything else as source', () => {
      expect(
        [
          'src/button.tsx',
          'src/styles/tokens.css',
          'web-tokens.css',
          'src/button.test.tsx',
          'src/button.stories.tsx',
          'tests/commands/asset.test.ts',
          'src/__tests__/helper.ts',
          'README.md',
          'tsconfig.build.json',
          'vitest.config.ts',
        ].map(isShippedSourcePath),
      ).toEqual([
        true,
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    });

    it('counts a manifest change only when it reaches an install', () => {
      const base = {
        dependencies: { zod: '^4.0.0' },
        devDependencies: { vitest: '^4.0.0' },
        name: '@genfeedai/ui',
        scripts: { test: 'vitest run' },
        version: '2.0.1',
      };
      expect(
        manifestShipsChange(base, {
          ...base,
          devDependencies: { vitest: '^4.1.0' },
          scripts: { test: 'vitest' },
          version: '2.1.0',
        }),
      ).toBe(false);
      expect(
        manifestShipsChange(base, {
          ...base,
          dependencies: { zod: '^4.1.0' },
        }),
      ).toBe(true);
    });
  });

  function validate() {
    return validateEnrollment({
      enrollment: readEnrollment(root),
      inventory: readPackageInventory(root),
    });
  }

  function writeEnrollment(enrollment: unknown) {
    writeFileSync(
      path.join(root, 'scripts', 'npm-release-enrollment.json'),
      JSON.stringify(enrollment, null, 2),
    );
  }

  function writePackage(directory: string, pkg: unknown) {
    const packageDir = path.join(root, 'packages', directory);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
    );
  }

  function publicManifest(name: string, version: string) {
    return {
      license: 'MIT',
      name,
      publishConfig: {
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
      version,
    };
  }
});
