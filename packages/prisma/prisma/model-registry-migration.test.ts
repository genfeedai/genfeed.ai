import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260804231500_canonicalize_model_registry/migration.sql',
  ),
  'utf8',
);

/**
 * Postgres `jsonb_typeof`, restricted to the shapes a `providerConfig` value
 * can take. Used to replay the migration's CASE guard against fixtures without
 * needing a live database.
 */
function jsonbTypeof(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value === 'object' ? 'object' : typeof value;
}

/**
 * Replays the guarded left operand of the `config` merge:
 * `CASE WHEN jsonb_typeof(config->'providerConfig') = 'object'
 *       THEN config->'providerConfig' ELSE '{}'::JSONB END`
 */
function resolveMergeLeftOperand(
  providerConfig: unknown,
): Record<string, unknown> {
  return jsonbTypeof(providerConfig) === 'object'
    ? (providerConfig as Record<string, unknown>)
    : {};
}

describe('canonicalize model registry migration', () => {
  it('guards the providerConfig merge operand with a jsonb_typeof object check', () => {
    expect(migrationSource).toContain(
      "WHEN jsonb_typeof(\"config\"->'providerConfig') = 'object'",
    );
    expect(migrationSource).toContain("ELSE '{}'::JSONB");
    // The unguarded COALESCE form concatenated arrays instead of merging objects.
    expect(migrationSource).not.toContain(
      "COALESCE(\"config\"->'providerConfig', '{}'::JSONB)",
    );
  });

  it('keeps config object-shaped for every providerConfig fixture shape', () => {
    const fixtures = [
      { label: 'object', providerConfig: { apiVersion: 'v1', region: 'eu' } },
      { label: 'array', providerConfig: ['v1', 'eu'] },
      { label: 'string scalar', providerConfig: 'v1' },
      { label: 'number scalar', providerConfig: 42 },
      { label: 'boolean scalar', providerConfig: true },
      { label: 'json null', providerConfig: null },
      { label: 'missing key', providerConfig: undefined },
    ];

    for (const { label, providerConfig } of fixtures) {
      const leftOperand = resolveMergeLeftOperand(providerConfig);

      expect(jsonbTypeof(leftOperand), label).toBe('object');
      expect(Array.isArray(leftOperand), label).toBe(false);
    }
  });

  it('preserves the keys of a valid object providerConfig', () => {
    const providerConfig = { apiVersion: 'v1', region: 'eu' };

    expect(resolveMergeLeftOperand(providerConfig)).toEqual(providerConfig);
  });

  it('falls back to an empty object for malformed providerConfig values', () => {
    expect(resolveMergeLeftOperand(['v1'])).toEqual({});
    expect(resolveMergeLeftOperand('v1')).toEqual({});
    expect(resolveMergeLeftOperand(null)).toEqual({});
  });
});
