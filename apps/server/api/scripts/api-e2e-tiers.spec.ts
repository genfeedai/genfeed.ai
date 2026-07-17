import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiE2eTierManifest } from './api-e2e-tiers.manifest';
import {
  buildApiE2eTierPlan,
  discoverApiE2eSpecs,
  validateApiE2eTierManifest,
} from './api-e2e-tiers';

const testDirectories: string[] = [];

afterEach(() => {
  for (const testDirectory of testDirectories.splice(0)) {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

function createFixture(files: string[]): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'api-e2e-tiers-'));
  testDirectories.push(rootDir);

  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, 'describe("fixture", () => {});\n');
  }

  return rootDir;
}

const manifest = (
  coreFiles: string[],
  exclusions: ApiE2eTierManifest['exclusions'] = [],
): ApiE2eTierManifest => ({
  coreFiles,
  exclusions,
});

describe('API E2E tiers', () => {
  it('discovers every spec recursively and ignores support files', () => {
    const rootDir = createFixture([
      'test/e2e/auth.e2e-spec.ts',
      'test/e2e/e2e-test.utils.ts',
      'test/integration/payments.integration.spec.ts',
      'test/integration/nested/worker.spec.ts',
    ]);

    expect(discoverApiE2eSpecs(rootDir)).toEqual([
      'test/e2e/auth.e2e-spec.ts',
      'test/integration/nested/worker.spec.ts',
      'test/integration/payments.integration.spec.ts',
    ]);
  });

  it('keeps the core tier explicit while full automatically includes new specs', () => {
    const files = [
      'test/e2e/core.e2e-spec.ts',
      'test/integration/excluded.integration.spec.ts',
      'test/integration/new.integration.spec.ts',
    ];
    const rootDir = createFixture(files);
    const tierManifest = manifest(['test/e2e/core.e2e-spec.ts'], [
      {
        file: 'test/integration/excluded.integration.spec.ts',
        reason: 'Requires a hermetic replacement.',
        trackingIssue: 71,
      },
    ]);

    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'core',
      }).selectedFiles,
    ).toEqual(['test/e2e/core.e2e-spec.ts']);
    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'full',
      }).selectedFiles,
    ).toEqual([
      'test/e2e/core.e2e-spec.ts',
      'test/integration/new.integration.spec.ts',
    ]);
  });

  it('requires every exclusion to have a reason and tracking issue', () => {
    const files = ['test/integration/excluded.integration.spec.ts'];

    expect(
      validateApiE2eTierManifest(
        files,
        manifest([], [
          {
            file: files[0]!,
            reason: ' ',
            trackingIssue: 0,
          },
        ]),
      ),
    ).toEqual([
      `Excluded file has no reason: ${files[0]}`,
      `Excluded file has no tracking issue: ${files[0]}`,
    ]);
  });

  it('fails when a core or excluded file is renamed without manifest updates', () => {
    expect(
      validateApiE2eTierManifest(
        ['test/e2e/renamed.e2e-spec.ts'],
        manifest(['test/e2e/missing.e2e-spec.ts'], [
          {
            file: 'test/integration/missing.integration.spec.ts',
            reason: 'Pending repair.',
            trackingIssue: 71,
          },
        ]),
      ),
    ).toEqual([
      'Core file is not discoverable: test/e2e/missing.e2e-spec.ts',
      'Excluded file is not discoverable: test/integration/missing.integration.spec.ts',
    ]);
  });
});
