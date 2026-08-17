/**
 * Deterministic, human-readable entity ids for specs and fixtures.
 *
 * Real ids are Prisma `cuid()` values (`c` + 24 base36 characters). Pasting a
 * real-looking id into a test trips secret scanners (GitGuardian's "Generic
 * High Entropy Secret") and tells the reader nothing, so tests build ids from a
 * label instead:
 *
 *   testId('org')       // 'corg000000000000000000001'
 *   testId('brand', 2)  // 'cbrand00000000000000000002'
 *   testIds('post', 3)  // three sequential post ids
 *
 * The result has the exact Prisma cuid shape (so it passes `isEntityId` and
 * every `IsEntityId` DTO validator), is stable across runs, and is low-entropy
 * by construction. `scripts/architecture/check-test-id-literals.ts` fails the
 * build when a spec hardcodes a high-entropy id-shaped literal instead.
 */

/** Prisma `cuid()` length: the `c` prefix plus 24 base36 characters. */
export const TEST_ID_LENGTH = 25;

const TEST_ID_PREFIX = 'c';
const TEST_ID_PAD_CHARACTER = '0';
const TEST_ID_LABEL_ALPHABET = /[^a-z0-9]/g;

function normalizeTestIdLabel(label: string): string {
  const normalized = label.toLowerCase().replaceAll(TEST_ID_LABEL_ALPHABET, '');
  if (normalized.length === 0) {
    throw new Error(
      `testId label must contain at least one [a-z0-9] character (received ${JSON.stringify(label)})`,
    );
  }
  return normalized;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `testId ${name} must be a positive integer (received ${String(value)})`,
    );
  }
}

/**
 * Build a deterministic, cuid-shaped entity id from a readable label.
 *
 * `label` is lowercased and stripped to `[a-z0-9]`; `sequence` (default `1`)
 * distinguishes several ids sharing one label. The label plus sequence digits
 * must fit in the 24 characters after the `c` prefix.
 */
export function testId(label: string, sequence = 1): string {
  const normalizedLabel = normalizeTestIdLabel(label);
  assertPositiveInteger(sequence, 'sequence');

  const suffix = String(sequence);
  const bodyLength = TEST_ID_LENGTH - TEST_ID_PREFIX.length;
  const padLength = bodyLength - normalizedLabel.length - suffix.length;
  if (padLength < 0) {
    throw new Error(
      `testId label "${normalizedLabel}" with sequence ${suffix} exceeds the ${bodyLength}-character cuid body`,
    );
  }

  return `${TEST_ID_PREFIX}${normalizedLabel}${TEST_ID_PAD_CHARACTER.repeat(padLength)}${suffix}`;
}

/** Build `count` sequential ids (`sequence` 1..count) for one label. */
export function testIds(label: string, count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      `testIds count must be a non-negative integer (received ${String(count)})`,
    );
  }
  return Array.from({ length: count }, (_, index) => testId(label, index + 1));
}
