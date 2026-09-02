import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPublishable,
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
    writePackage('enums', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('actions', publicManifest('@genfeedai/actions', '0.1.4'));
    writeEnrollment({
      enrolled: ['packages/contracts/src/enums'],
      excluded: {},
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/actions is publishable but is neither enrolled nor excluded; decide explicitly',
    ]);

    writeEnrollment({
      enrolled: ['packages/contracts/src/enums'],
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
    writePackage('enums', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('agent', {
      name: '@genfeedai/agent',
      private: true,
      version: '1.0.0',
    });
    writeEnrollment({
      enrolled: ['packages/contracts/src/enums', 'packages/agent'],
      excluded: {
        'packages/contracts/src/enums': 'contradiction',
        'packages/ghost': '',
      },
    });

    expect(validate().violations).toEqual([
      'scripts/npm-release-enrollment.json: packages/agent is enrolled but is not a public package under packages/',
      'scripts/npm-release-enrollment.json: packages/contracts/src/enums is both enrolled and excluded',
      'scripts/npm-release-enrollment.json: packages/ghost must document why it is excluded',
      'scripts/npm-release-enrollment.json: packages/ghost is excluded but is not a public package under packages/',
    ]);
  });

  it('plans only the enrolled versions npm has never seen', () => {
    writePackage('enums', publicManifest('@genfeedai/contracts', '2.3.3'));
    writePackage('cli', publicManifest('@genfeedai/cli', '0.6.0'));
    writePackage('harness', publicManifest('@genfeedai/harness', '0.1.0'));
    writeEnrollment({
      enrolled: ['packages/cli', 'packages/contracts/src/enums'],
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
        path: 'packages/contracts/src/enums',
        version: '2.3.3',
      },
    ]);
    expect(plan.bootstrapRequired).toEqual([]);
    expect(plan.excluded).toEqual([
      { path: 'packages/harness', reason: 'Never published.' },
    ]);
  });

  it('plans nothing when every enrolled version is already on npm', () => {
    writePackage('enums', publicManifest('@genfeedai/contracts', '2.3.3'));
    writeEnrollment({
      enrolled: ['packages/contracts/src/enums'],
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
