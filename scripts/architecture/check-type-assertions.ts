/**
 * Ratchet: production `as any` / `as never` / bare ts-ignore directives must not grow.
 *
 * These casts hide real type holes (domain enum vs Prisma enum was the
 * BatchStatus crash class). Counts may only go down. When a file hits zero for
 * a kind, drop its baseline entry in the same PR.
 *
 * Tests and stories are out of scope for this floor — clean them separately.
 *
 *   bun run check:type-assertions
 *   bun run check:type-assertions --update-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

export type AssertionKind = 'as_any' | 'as_never' | 'ts_ignore';

export type TypeAssertionOccurrence = {
  file: string;
  kind: AssertionKind;
  line: number;
  text: string;
};

export type TypeAssertionBaseline = {
  /** Relative path → count of that kind in production sources. */
  as_any: Record<string, number>;
  as_never: Record<string, number>;
  ts_ignore: Record<string, number>;
};

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE_PATH = path.join(
  ROOT,
  'scripts/architecture/type-assertions.baseline.json',
);

const INCLUDE_GLOBS = [
  'apps/**/*.{ts,tsx}',
  'packages/**/*.{ts,tsx}',
  'ee/**/*.{ts,tsx}',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/generated/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.stories.ts',
  '**/*.stories.tsx',
  '**/__tests__/**',
  '**/tests/**',
  '**/__fixtures__/**',
  '**/fixtures/**',
];

const KIND_PATTERNS: Record<AssertionKind, RegExp> = {
  as_any: /\bas any\b/g,
  as_never: /\bas never\b/g,
  ts_ignore: /@ts-ignore\b/g,
};

/**
 * `as any` / `as never` are code constructs, so prose and string data that
 * merely spell them are not violations — a doc comment reading "never `as
 * never`" used to count as one and fail the ratchet on a clean file.
 *
 * The ts-ignore directive is the opposite: it only ever *is* a comment, so it is
 * matched against the raw line and never goes through here.
 *
 * Comments and string bodies are blanked rather than deleted so column
 * positions still line up with the source; a `//` comment is the one case that
 * truncates, since nothing after it is code. Returning the block-comment state
 * lets the caller carry it across lines.
 */
export function stripCommentsAndStrings(
  line: string,
  inBlockComment: boolean,
): { inBlockComment: boolean; code: string } {
  let code = '';
  let block = inBlockComment;
  let quote: string | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    const next = line[i + 1];

    if (block) {
      if (char === '*' && next === '/') {
        block = false;
        code += '  ';
        i += 1;
        continue;
      }
      code += ' ';
      continue;
    }

    if (quote) {
      // Skip the escaped character wholesale so `'\\'` ends the string here.
      if (char === '\\') {
        code += '  ';
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      code += ' ';
      continue;
    }

    if (char === '/' && next === '*') {
      block = true;
      code += '  ';
      i += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      break;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      code += ' ';
      continue;
    }

    code += char;
  }

  return { code, inBlockComment: block };
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function relativeToRoot(absolutePath: string): string {
  return toPosix(path.relative(ROOT, absolutePath));
}

export function scanTypeAssertions(
  includeGlobs = INCLUDE_GLOBS,
  ignoreGlobs = IGNORE_GLOBS,
): TypeAssertionOccurrence[] {
  const files = globSync(includeGlobs, {
    absolute: true,
    cwd: ROOT,
    ignore: ignoreGlobs,
    nodir: true,
  });

  const occurrences: TypeAssertionOccurrence[] = [];

  for (const absolutePath of files) {
    const file = relativeToRoot(absolutePath);
    let text: string;
    try {
      text = readFileSync(absolutePath, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    let inBlockComment = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const stripped = stripCommentsAndStrings(line, inBlockComment);
      inBlockComment = stripped.inBlockComment;

      for (const [kind, pattern] of Object.entries(KIND_PATTERNS) as Array<
        [AssertionKind, RegExp]
      >) {
        // A ts-ignore directive lives in a comment by definition; casts do not.
        const haystack = kind === 'ts_ignore' ? line : stripped.code;
        pattern.lastIndex = 0;
        if (!pattern.test(haystack)) {
          continue;
        }
        // Reset after test(); count matches on a fresh regex.
        const matches = haystack.match(new RegExp(pattern.source, 'g')) ?? [];
        for (const match of matches) {
          occurrences.push({
            file,
            kind,
            line: index + 1,
            text: match,
          });
        }
      }
    }
  }

  return occurrences;
}

export function groupCounts(
  occurrences: TypeAssertionOccurrence[],
  kind: AssertionKind,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const occurrence of occurrences) {
    if (occurrence.kind !== kind) {
      continue;
    }
    counts[occurrence.file] = (counts[occurrence.file] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildBaseline(
  occurrences: TypeAssertionOccurrence[],
): TypeAssertionBaseline {
  return {
    as_any: groupCounts(occurrences, 'as_any'),
    as_never: groupCounts(occurrences, 'as_never'),
    ts_ignore: groupCounts(occurrences, 'ts_ignore'),
  };
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function readBaseline(): TypeAssertionBaseline {
  const raw = readFileSync(BASELINE_PATH, 'utf8');
  return JSON.parse(raw) as TypeAssertionBaseline;
}

function writeBaseline(baseline: TypeAssertionBaseline): void {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(baseline, null, 2)}\n`,
    'utf8',
  );
}

export type TypeAssertionViolation =
  | {
      kind: AssertionKind;
      type: 'growth';
      file: string;
      baseline: number;
      actual: number;
    }
  | {
      kind: AssertionKind;
      type: 'new_file';
      file: string;
      actual: number;
    }
  | {
      kind: AssertionKind;
      type: 'stale_baseline';
      file: string;
      baseline: number;
      actual: number;
    };

export function diffAgainstBaseline(
  baseline: TypeAssertionBaseline,
  actual: TypeAssertionBaseline,
): TypeAssertionViolation[] {
  const violations: TypeAssertionViolation[] = [];
  const kinds: AssertionKind[] = ['as_any', 'as_never', 'ts_ignore'];

  for (const kind of kinds) {
    const baseMap = baseline[kind];
    const actualMap = actual[kind];
    const files = new Set([...Object.keys(baseMap), ...Object.keys(actualMap)]);

    for (const file of files) {
      const baseCount = baseMap[file] ?? 0;
      const actualCount = actualMap[file] ?? 0;

      if (actualCount > baseCount) {
        if (baseCount === 0) {
          violations.push({
            actual: actualCount,
            file,
            kind,
            type: 'new_file',
          });
        } else {
          violations.push({
            actual: actualCount,
            baseline: baseCount,
            file,
            kind,
            type: 'growth',
          });
        }
      } else if (actualCount < baseCount) {
        violations.push({
          actual: actualCount,
          baseline: baseCount,
          file,
          kind,
          type: 'stale_baseline',
        });
      }
    }
  }

  return violations;
}

function printSummary(
  actual: TypeAssertionBaseline,
  violations: TypeAssertionViolation[],
): void {
  process.stdout.write('Type assertion ratchet (production sources)\n');
  process.stdout.write(
    `  as any:     ${total(actual.as_any)} across ${Object.keys(actual.as_any).length} files\n`,
  );
  process.stdout.write(
    `  as never:   ${total(actual.as_never)} across ${Object.keys(actual.as_never).length} files\n`,
  );
  process.stdout.write(
    `  @ts-ignore: ${total(actual.ts_ignore)} across ${Object.keys(actual.ts_ignore).length} files\n`,
  );

  if (violations.length === 0) {
    process.stdout.write('  OK — no growth vs baseline.\n');
    return;
  }

  process.stdout.write('\nViolations:\n');
  for (const violation of violations) {
    if (violation.type === 'new_file') {
      process.stdout.write(
        `  [NEW ${violation.kind}] ${violation.file}: ${violation.actual} (was 0)\n`,
      );
    } else if (violation.type === 'growth') {
      process.stdout.write(
        `  [GROW ${violation.kind}] ${violation.file}: ${violation.actual} > baseline ${violation.baseline}\n`,
      );
    } else {
      process.stdout.write(
        `  [STALE ${violation.kind}] ${violation.file}: baseline ${violation.baseline} but only ${violation.actual} remain — prune baseline\n`,
      );
    }
  }
  process.stdout.write(
    '\nFix the cast, or if you intentionally cleaned some: bun run check:type-assertions --update-baseline\n',
  );
}

function main(): void {
  const updateBaseline = process.argv.includes('--update-baseline');
  const occurrences = scanTypeAssertions();
  const actual = buildBaseline(occurrences);

  if (updateBaseline) {
    writeBaseline(actual);
    process.stdout.write(
      `Updated type-assertions baseline (${total(actual.as_any)} as any, ${total(actual.as_never)} as never, ${total(actual.ts_ignore)} @ts-ignore).\n`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  const violations = diffAgainstBaseline(baseline, actual);
  printSummary(actual, violations);

  // Stale baselines are a soft fail only when they are the only issue? No —
  // require pruning so the floor keeps dropping.
  if (violations.length > 0) {
    process.exit(1);
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  main();
}
