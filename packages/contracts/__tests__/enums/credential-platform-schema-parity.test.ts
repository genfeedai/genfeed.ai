/**
 * Guard: `PRISMA_CREDENTIAL_PLATFORM_VALUES` is a hand-maintained mirror of
 * `enum CredentialPlatform` in the Prisma schema — `@genfeedai/contracts` cannot
 * depend on `@genfeedai/prisma`, so nothing but this test keeps the two in
 * sync.
 *
 * Drift is not a cosmetic problem. A label added to the schema but missing
 * here makes `toPrismaCredentialPlatform` return `undefined` for a real
 * platform, and every caller that spreads the mapped value into a `where`
 * clause then drops its platform predicate — widening a credential lookup
 * instead of failing it.
 *
 * The schema is parsed rather than restated so a member added to only one side
 * fails CI instead of shipping.
 *
 * @see packages/prisma/prisma/schema.prisma `enum CredentialPlatform`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRISMA_CREDENTIAL_PLATFORM_VALUES } from '../../src/enums/platform-prisma.mapper';

function findSchemaPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'packages/prisma/prisma/schema.prisma');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('Could not locate packages/prisma/prisma/schema.prisma');
}

function readSchemaCredentialPlatformLabels(): string[] {
  const schema = readFileSync(findSchemaPath(), 'utf8');
  const block = /enum\s+CredentialPlatform\s*\{([^}]*)\}/.exec(schema);
  if (!block) {
    throw new Error('enum CredentialPlatform not found in schema.prisma');
  }

  return block[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

describe('CredentialPlatform schema parity', () => {
  const schemaLabels = readSchemaCredentialPlatformLabels();

  it('reads a non-empty enum block from the Prisma schema', () => {
    expect(schemaLabels.length).toBeGreaterThan(0);
  });

  it('mirrors every Prisma CredentialPlatform label', () => {
    const mirrored = new Set<string>(PRISMA_CREDENTIAL_PLATFORM_VALUES);
    const missing = schemaLabels.filter((label) => !mirrored.has(label));

    expect(
      missing,
      `PRISMA_CREDENTIAL_PLATFORM_VALUES is missing schema labels: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('declares no label the Prisma schema does not have', () => {
    const inSchema = new Set(schemaLabels);
    const extra = PRISMA_CREDENTIAL_PLATFORM_VALUES.filter(
      (value) => !inSchema.has(value),
    );

    expect(
      extra,
      `PRISMA_CREDENTIAL_PLATFORM_VALUES declares labels absent from the schema: ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the intentional DEVTO spelling (not DEV_TO)', () => {
    expect(schemaLabels).toContain('DEVTO');
    expect(schemaLabels).not.toContain('DEV_TO');
  });
});
