import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

/**
 * Test files must not hardcode real-looking entity ids.
 *
 * A pasted Prisma cuid (`cmptu23g70001zixnzwbzwp2e`), a Mongo-era ObjectId
 * (`507f1f77bcf86cd799439011`) or a ULID is high-entropy by construction, so
 * secret scanners (GitGuardian "Generic High Entropy Secret") flag every one of
 * them and the incident queue fills with noise that hides real leaks. Specs
 * build ids from a label instead — `testId('org')` from
 * `@genfeedai/helpers/testing/test-id.helper` — which is readable, stable and
 * low-entropy. Readable hand-written ids (`cmuser0000000000000000001`) stay
 * below the entropy floor and are still accepted.
 */

const DEFAULT_INCLUDE_GLOBS = [
  '**/*.{spec,test}.{cjs,cts,js,mjs,mts,ts,tsx}',
  '**/__tests__/**/*.{cjs,cts,js,mjs,mts,ts,tsx}',
  '**/test/**/*.{cjs,cts,js,mjs,mts,ts,tsx}',
  '**/e2e/**/*.{cjs,cts,js,mjs,mts,ts,tsx}',
  'playwright/**/*.{cjs,cts,js,mjs,mts,ts,tsx}',
];
const DEFAULT_IGNORE_GLOBS = [
  '**/.claude/**',
  '**/.git/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
];

/**
 * Shannon entropy (bits per character) above which an id-shaped token reads as
 * generated rather than written. Hand-written ids top out around 2.8; the
 * lowest real cuid / ObjectId seen in the tree scored 3.2.
 */
export const HIGH_ENTROPY_THRESHOLD_BITS = 3;

const ID_SHAPES: ReadonlyArray<{
  readonly name: string;
  readonly pattern: RegExp;
}> = [
  { name: 'cuid', pattern: /^c[a-z0-9]{24}$/ },
  { name: 'cuid2', pattern: /^[a-z][a-z0-9]{23}$/ },
  { name: 'objectid', pattern: /^[0-9a-f]{24}$/ },
  { name: 'ulid', pattern: /^[0-9A-HJKMNP-TV-Z]{26}$/ },
];

// Candidate tokens: 24–26 alphanumerics that are not part of a longer
// identifier (`_` and neighbouring alphanumerics are excluded on both sides).
const CANDIDATE_TOKEN_PATTERN =
  /(?<![A-Za-z0-9_])[A-Za-z0-9]{24,26}(?![A-Za-z0-9_])/g;

export type TestIdLiteralViolation = {
  entropy: number;
  file: string;
  line: number;
  shape: string;
  token: string;
};

export type TestIdLiteralOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export function shannonEntropyBitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function classifyIdShape(token: string): string | null {
  return ID_SHAPES.find((shape) => shape.pattern.test(token))?.name ?? null;
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

export function findTestIdLiteralViolations(
  file: string,
  source: string,
): TestIdLiteralViolation[] {
  const violations: TestIdLiteralViolation[] = [];
  for (const match of source.matchAll(CANDIDATE_TOKEN_PATTERN)) {
    const token = match[0];
    const shape = classifyIdShape(token);
    if (shape === null) {
      continue;
    }
    const entropy = shannonEntropyBitsPerChar(token);
    if (entropy < HIGH_ENTROPY_THRESHOLD_BITS) {
      continue;
    }
    violations.push({
      entropy,
      file,
      line: lineForOffset(source, match.index),
      shape,
      token,
    });
  }
  return violations;
}

export function checkTestIdLiterals(
  options: TestIdLiteralOptions = {},
): TestIdLiteralViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));

  const violations: TestIdLiteralViolation[] = [];
  for (const file of files) {
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    violations.push(
      ...findTestIdLiteralViolations(file.replaceAll('\\', '/'), source),
    );
  }
  return violations;
}

if (import.meta.main) {
  const violations = checkTestIdLiterals();

  if (violations.length > 0) {
    const files = new Set(violations.map((violation) => violation.file));
    console.error(
      `Hardcoded high-entropy ids found in ${files.size} test file(s) (${violations.length} occurrence(s)).`,
    );
    console.error(
      "Build ids with testId('label') from '@genfeedai/helpers/testing/test-id.helper' ('@helpers/testing/test-id.helper' in apps/server) instead of pasting real-looking ids — secret scanners flag them.",
    );
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line}: ${violation.token} (${violation.shape}, ${violation.entropy.toFixed(2)} bits/char)`,
      );
    }
    process.exit(1);
  }

  console.log('Test id literal guard passed.');
}
