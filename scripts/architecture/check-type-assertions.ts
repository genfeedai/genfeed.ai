/**
 * Production `as any` and bare `@ts-expect-error` are banned (floor is 0).
 * Production `as never` is a shrinking ratchet — counts may only go down.
 *
 * These casts hide real type holes (domain enum vs Prisma enum was the
 * BatchStatus crash class). When an `as never` file hits zero, drop its
 * baseline entry in the same PR. Do not add `as any` / `@ts-expect-error` baseline
 * entries — remove the cast.
 *
 * Tests and stories are out of scope for this floor — clean them separately.
 *
 *   bun run check:type-assertions
 *   bun run check:type-assertions --update-baseline  # as never only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

export const BANNED_ASSERTION_KINDS = ['as_any', 'ts_ignore'] as const;
export const RATCHETED_ASSERTION_KINDS = ['as_never'] as const;

export type BannedAssertionKind = (typeof BANNED_ASSERTION_KINDS)[number];
export type RatchetedAssertionKind = (typeof RATCHETED_ASSERTION_KINDS)[number];
export type AssertionKind = BannedAssertionKind | RatchetedAssertionKind;

export type TypeAssertionOccurrence = {
  file: string;
  kind: AssertionKind;
  line: number;
  text: string;
};

/** Per-kind file counts from a production scan. */
export type TypeAssertionScan = Record<AssertionKind, Record<string, number>>;

/** On-disk ratchet. Banned kinds are not stored — they must stay at zero. */
export type TypeAssertionBaseline = {
  as_never: Record<string, number>;
};

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE_PATH = path.join(
  ROOT,
  'scripts/architecture/type-assertions.baseline.json',
);

const INCLUDE_GLOBS = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

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
 * Comments, string bodies, and template text are blanked rather than deleted so
 * column positions still line up with the source. Template interpolations stay
 * intact because they are executable code. A `//` comment is the one case that
 * truncates, since nothing after it is code. Returning the block-comment and
 * template-stack state lets the caller carry both across lines.
 */
type TemplateLiteralFrame = {
  /** Zero in template text; positive while inside a `${...}` interpolation. */
  interpolationDepth: number;
};

export function stripCommentsAndStrings(
  line: string,
  inBlockComment: boolean,
  templateStack: readonly TemplateLiteralFrame[] = [],
): {
  inBlockComment: boolean;
  code: string;
  templateStack: TemplateLiteralFrame[];
} {
  let code = '';
  let block = inBlockComment;
  let quote: string | null = null;
  const templates = templateStack.map((frame) => ({ ...frame }));

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

    const template = templates.at(-1);
    if (template?.interpolationDepth === 0) {
      if (char === '\\') {
        code += next === undefined ? ' ' : '  ';
        if (next !== undefined) {
          i += 1;
        }
        continue;
      }
      if (char === '`') {
        templates.pop();
        code += ' ';
        continue;
      }
      if (char === '$' && next === '{') {
        template.interpolationDepth = 1;
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
        code += next === undefined ? ' ' : '  ';
        if (next !== undefined) {
          i += 1;
        }
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
    if (char === "'" || char === '"') {
      quote = char;
      code += ' ';
      continue;
    }
    if (char === '`') {
      templates.push({ interpolationDepth: 0 });
      code += ' ';
      continue;
    }

    if (template && char === '{') {
      template.interpolationDepth += 1;
    } else if (template && char === '}') {
      template.interpolationDepth -= 1;
      if (template.interpolationDepth === 0) {
        code += ' ';
        continue;
      }
    }

    code += char;
  }

  return { code, inBlockComment: block, templateStack: templates };
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
    let templateStack: TemplateLiteralFrame[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const stripped = stripCommentsAndStrings(
        line,
        inBlockComment,
        templateStack,
      );
      inBlockComment = stripped.inBlockComment;
      templateStack = stripped.templateStack;

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

export function scanToCounts(
  occurrences: TypeAssertionOccurrence[],
): TypeAssertionScan {
  return {
    as_any: groupCounts(occurrences, 'as_any'),
    as_never: groupCounts(occurrences, 'as_never'),
    ts_ignore: groupCounts(occurrences, 'ts_ignore'),
  };
}

export function ratchetBaselineFromScan(
  actual: TypeAssertionScan,
): TypeAssertionBaseline {
  return { as_never: actual.as_never };
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

type LegacyBaselineJson = {
  as_any?: Record<string, number>;
  as_never?: Record<string, number>;
  ts_ignore?: Record<string, number>;
};

export function readBaselineShape(raw: unknown): TypeAssertionBaseline {
  const parsed = (raw ?? {}) as LegacyBaselineJson;
  return { as_never: parsed.as_never ?? {} };
}

function readBaseline(): TypeAssertionBaseline {
  const raw = readFileSync(BASELINE_PATH, 'utf8');
  return readBaselineShape(JSON.parse(raw) as unknown);
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
      kind: BannedAssertionKind;
      type: 'banned';
      file: string;
      actual: number;
    }
  | {
      kind: RatchetedAssertionKind;
      type: 'growth';
      file: string;
      baseline: number;
      actual: number;
    }
  | {
      kind: RatchetedAssertionKind;
      type: 'new_file';
      file: string;
      actual: number;
    }
  | {
      kind: RatchetedAssertionKind;
      type: 'stale_baseline';
      file: string;
      baseline: number;
      actual: number;
    };

export function evaluateTypeAssertions(
  baseline: TypeAssertionBaseline,
  actual: TypeAssertionScan,
): TypeAssertionViolation[] {
  const violations: TypeAssertionViolation[] = [];

  for (const kind of BANNED_ASSERTION_KINDS) {
    const files = Object.keys(actual[kind]).sort((left, right) =>
      left.localeCompare(right),
    );
    for (const file of files) {
      const actualCount = actual[kind][file] ?? 0;
      if (actualCount > 0) {
        violations.push({
          actual: actualCount,
          file,
          kind,
          type: 'banned',
        });
      }
    }
  }

  const baseMap = baseline.as_never;
  const actualMap = actual.as_never;
  const files = [
    ...new Set([...Object.keys(baseMap), ...Object.keys(actualMap)]),
  ].sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const baseCount = baseMap[file] ?? 0;
    const actualCount = actualMap[file] ?? 0;

    if (actualCount > baseCount) {
      if (baseCount === 0) {
        violations.push({
          actual: actualCount,
          file,
          kind: 'as_never',
          type: 'new_file',
        });
      } else {
        violations.push({
          actual: actualCount,
          baseline: baseCount,
          file,
          kind: 'as_never',
          type: 'growth',
        });
      }
    } else if (actualCount < baseCount) {
      violations.push({
        actual: actualCount,
        baseline: baseCount,
        file,
        kind: 'as_never',
        type: 'stale_baseline',
      });
    }
  }

  return violations;
}

function printSummary(
  actual: TypeAssertionScan,
  violations: TypeAssertionViolation[],
): void {
  process.stdout.write('Type assertions (production sources)\n');
  process.stdout.write(
    `  as any:     ${total(actual.as_any)} (banned — must stay 0)\n`,
  );
  process.stdout.write(
    `  @ts-ignore: ${total(actual.ts_ignore)} (banned — must stay 0)\n`,
  );
  process.stdout.write(
    `  as never:   ${total(actual.as_never)} across ${Object.keys(actual.as_never).length} files (ratchet)\n`,
  );

  if (violations.length === 0) {
    process.stdout.write(
      '  OK — banned kinds empty, as never at or below baseline.\n',
    );
    return;
  }

  process.stdout.write('\nViolations:\n');
  for (const violation of violations) {
    if (violation.type === 'banned') {
      process.stdout.write(
        `  [BAN ${violation.kind}] ${violation.file}: ${violation.actual} — production ${violation.kind === 'as_any' ? '`as any`' : '`@ts-ignore`'} is forbidden. Remove the cast; do not add a baseline entry.\n`,
      );
    } else if (violation.type === 'new_file') {
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

  const hasRatchetDrift = violations.some(
    (violation) => violation.type !== 'banned',
  );
  const hasBanned = violations.some((violation) => violation.type === 'banned');
  if (hasBanned) {
    process.stdout.write(
      '\nBanned kinds have no --update-baseline escape hatch. Remove the cast.\n',
    );
  }
  if (hasRatchetDrift) {
    process.stdout.write(
      '\nFor as never cleanups: bun run check:type-assertions --update-baseline\n',
    );
  }
}

function main(): void {
  const updateBaseline = process.argv.includes('--update-baseline');
  const occurrences = scanTypeAssertions();
  const actual = scanToCounts(occurrences);
  const violations = evaluateTypeAssertions(readBaseline(), actual);

  if (updateBaseline) {
    const banned = violations.filter(
      (violation) => violation.type === 'banned',
    );
    if (banned.length > 0) {
      printSummary(actual, banned);
      process.exit(1);
    }
    writeBaseline(ratchetBaselineFromScan(actual));
    process.stdout.write(
      `Updated as never baseline (${total(actual.as_never)} across ${Object.keys(actual.as_never).length} files).\n`,
    );
    process.exit(0);
  }

  printSummary(actual, violations);

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
