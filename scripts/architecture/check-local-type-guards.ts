/**
 * Guard against new local copies of the shared record/string readers (#5909).
 *
 * `isRecord`, `readString`, `readRecord` and `asRecord` (plus their variants
 * `readNonEmptyString`, `readNonBlankString`, `readRawString`,
 * `readRecordOrNull`, `readRecordOrUndefined`, `isObjectLike`, `readRecordCopy` and the
 * `*OrNull` string readers) live in
 * `@genfeedai/utils/data/extract.util` (re-exported from
 * `@genfeedai/contracts/constants/type-guards.constant`, which packages that
 * utils depends on import directly). Re-declaring them lets copies drift on
 * array, null and trimming handling.
 *
 * Remaining copies are ratcheted in `local-type-guards.baseline.ts`: a file may
 * never gain declarations, and a baseline entry that shrinks must be lowered
 * (a stale entry also fails) so the count only goes down.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { LOCAL_TYPE_GUARD_BASELINE } from './local-type-guards.baseline';

// `@genfeedai/utils` depends on contracts/helpers/services, so the canonical
// implementation lives in contracts and extract.util re-exports it.
const SHARED_HELPER_FILES: ReadonlySet<string> = new Set([
  'packages/contracts/src/constants/type-guards.constant.ts',
  'packages/utils/data/extract.util.ts',
]);

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{ts,tsx}',
  'packages/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.*',
  '**/*.test.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

// Keep in sync with the readers exported by packages/utils/data/extract.util.ts
// (a test asserts every guarded name is still exported there).
export const GUARDED_HELPER_NAMES = [
  'isRecord',
  'asRecord',
  'readString',
  'readNonEmptyString',
  'readNonBlankString',
  'readRawString',
  'readRecord',
  'readRecordOrNull',
  'readRecordOrUndefined',
  'isObjectLike',
  'readNonEmptyStringOrNull',
  'readTrimmedStringOrNull',
  'readNonBlankStringOrNull',
  'readRecordCopy',
] as const;

// function, const/let/var and arrow-function declarations.
const DECLARATION_PATTERN = new RegExp(
  `(?:\\bfunction\\s+|\\b(?:const|let|var)\\s+)(${GUARDED_HELPER_NAMES.join('|')})\\b`,
  'gu',
);

export type LocalTypeGuardViolation = {
  allowed: number;
  count: number;
  file: string;
  kind: 'new-local-copy' | 'stale-baseline';
  message: string;
};

export type LocalTypeGuardOptions = {
  baseline?: Readonly<Record<string, number>>;
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function runCheckLocalTypeGuards(options: LocalTypeGuardOptions = {}): {
  scannedFileCount: number;
  totalLocalCopies: number;
  violations: LocalTypeGuardViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = options.baseline ?? LOCAL_TYPE_GUARD_BASELINE;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();
  const counts = new Map<string, number>();

  for (const filePath of files) {
    const file = normalizePath(path.relative(rootDir, filePath));
    if (SHARED_HELPER_FILES.has(file)) {
      continue;
    }
    const count = [
      ...readFileSync(filePath, 'utf8').matchAll(DECLARATION_PATTERN),
    ].length;
    if (count > 0) {
      counts.set(file, count);
    }
  }

  const violations: LocalTypeGuardViolation[] = [];
  let totalLocalCopies = 0;

  for (const [file, count] of counts) {
    totalLocalCopies += count;
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      violations.push({
        allowed,
        count,
        file,
        kind: 'new-local-copy',
        message:
          'Import isRecord/readString/readRecord (or a variant) from @genfeedai/utils/data/extract.util (or @genfeedai/contracts/constants/type-guards.constant in packages utils depends on) instead of declaring a local copy.',
      });
    } else if (count < allowed) {
      violations.push({
        allowed,
        count,
        file,
        kind: 'stale-baseline',
        message: `Baseline allows ${allowed} but only ${count} remain. Lower the entry in local-type-guards.baseline.ts.`,
      });
    }
  }

  for (const [file, allowed] of Object.entries(baseline)) {
    if (!counts.has(file)) {
      violations.push({
        allowed,
        count: 0,
        file,
        kind: 'stale-baseline',
        message:
          'No local copy remains in this file. Remove the entry from local-type-guards.baseline.ts.',
      });
    }
  }

  return { scannedFileCount: files.length, totalLocalCopies, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckLocalTypeGuards();

  if (result.violations.length > 0) {
    console.error('Local type-guard helper violations found:');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file} (${violation.count}/${violation.allowed}) — ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Local type-guard guard passed: ${result.totalLocalCopies} baselined copy(ies) across ${result.scannedFileCount} source file(s).`,
  );
}
