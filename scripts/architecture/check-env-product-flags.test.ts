import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isProductFlagKey,
  runCheckEnvProductFlags,
} from './check-env-product-flags';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function createRepo(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'env-product-flags-'));
  testDirs.push(rootDir);
  for (const [file, source] of Object.entries(files)) {
    const absolute = path.join(rootDir, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return rootDir;
}

describe('isProductFlagKey', () => {
  it.each([
    'MEDIA_PERCEPTION_ENABLED',
    'MODERATION_MODE',
    'TASK_ROUTING_MIN_CONFIDENCE',
    'MODERATION_THRESHOLDS',
  ])('flags %s', (key) => {
    expect(isProductFlagKey(key)).toBe(true);
  });

  it.each(['TYPESAFE_API_KEY', 'TYPED_DECISION_TIMEOUT_MS', 'REDIS_URL'])(
    'ignores %s',
    (key) => {
      expect(isProductFlagKey(key)).toBe(false);
    },
  );
});

describe('runCheckEnvProductFlags', () => {
  it('passes the current repository schemas', () => {
    const result = runCheckEnvProductFlags({
      rootDir: process.cwd(),
    });

    expect(result.scannedFileCount).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it('fails a new product flag in a shared schema', () => {
    const rootDir = createRepo({
      'packages/config/src/schemas/ai.schema.ts': [
        "import Joi from 'joi';",
        'export const aiSchema = {',
        "  TYPESAFE_API_KEY: Joi.string().optional().allow(''),",
        "  NEW_FEATURE_ENABLED: Joi.string().valid('true', 'false'),",
        '};',
      ].join('\n'),
    });

    expect(runCheckEnvProductFlags({ rootDir }).violations).toEqual([
      {
        file: 'packages/config/src/schemas/ai.schema.ts',
        key: 'NEW_FEATURE_ENABLED',
        line: 4,
      },
    ]);
  });

  it('fails a product flag in a service-local schema extension', () => {
    const rootDir = createRepo({
      'apps/server/workers/src/config/config.service.ts': [
        'extend: {',
        "    SWEEP_DECISION_MODE: Joi.string().valid('off', 'shadow'),",
        '    SWEEP_MIN_CONFIDENCE: Joi.number(),',
        '}',
      ].join('\n'),
    });

    expect(
      runCheckEnvProductFlags({ rootDir }).violations.map(({ key }) => key),
    ).toEqual(['SWEEP_DECISION_MODE', 'SWEEP_MIN_CONFIDENCE']);
  });

  it('allows the infrastructure allow-list and ignores specs', () => {
    const rootDir = createRepo({
      'packages/config/src/schemas/sentry.schema.ts':
        'export const sentrySchema = {\n  SENTRY_ENABLED: Joi.string(),\n};',
      'packages/config/src/schemas/ai.schema.spec.ts':
        'const fixture = {\n  FIXTURE_MODE: 1,\n};',
    });

    expect(runCheckEnvProductFlags({ rootDir }).violations).toEqual([]);
  });

  it('ignores optional interface members', () => {
    const rootDir = createRepo({
      'packages/libs/config/config.service.ts':
        "interface ApiEnvConfig {\n  API_QUERY_METRICS_ENABLED?: 'true' | 'false';\n}",
    });

    expect(runCheckEnvProductFlags({ rootDir }).violations).toEqual([]);
  });
});
