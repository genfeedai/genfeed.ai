/**
 * Ratchet: direct user-visible JSX strings in the product app must not grow.
 *
 * This is a floor, not an inventory. It counts meaningful JSX text and direct
 * string children in the main app and shared product packages. Template
 * literals assembled at runtime, strings built in helpers, and copy passed
 * through props are deliberately not counted. A flat or zero delta therefore
 * does not mean a surface is fully migrated; pseudo-locale QA and migration
 * review still have to find the strings this static guard cannot see.
 *
 * Correct fix for new copy in `apps/app` or shared product packages: add a key
 * to `apps/app/messages/en/<namespace>.json` and resolve it with
 * `useTranslations('<namespace>')` / `getTranslations` from next-intl. Shared
 * packages consume the host app catalog (namespaces `ui`, `pages`, `agent`,
 * `contexts`). Do not hoist strings into a module-level `COPY` const — that
 * hides them from this ratchet without making them translatable. See
 * `.agents/memory/project_shared_package_message_catalogs.md`.
 *
 * Counts are tracked per file. A file over its allowance is a regression, and
 * a file under it makes the baseline stale so cleanup is locked in immediately.
 * `--update-baseline` refuses equal or higher totals and refuses per-file growth,
 * even when unrelated cleanup makes the repository total lower.
 *
 *   bun run check:untranslated-strings
 *   bun run check:untranslated-strings --update-baseline
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import * as ts from 'typescript';

export const UNTRANSLATED_STRING_FIX_HELP =
  'Fix: add the copy to apps/app/messages/en/<namespace>.json and resolve it with ' +
  "useTranslations('<namespace>') or getTranslations from next-intl. Shared packages " +
  'consume the host app catalog (namespaces ui, pages, agent, contexts). Do not hoist ' +
  'strings into a module-level COPY const — that hides them from this ratchet without ' +
  'making them translatable.';

const BASELINE_VERSION = 1;
const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE_PATH = path.join(
  ROOT,
  'scripts/architecture/untranslated-strings.baseline.json',
);

const INCLUDE_GLOBS = [
  'apps/app/**/*.{jsx,tsx}',
  'packages/**/*.{jsx,tsx}',
  'ee/**/*.{jsx,tsx}',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/generated/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.spec.{jsx,tsx}',
  '**/*.test.{jsx,tsx}',
  '**/*.stories.{jsx,tsx}',
  '**/__tests__/**',
  '**/tests/**',
  '**/__fixtures__/**',
  '**/fixtures/**',
];

const JSX_ENTITY_PATTERN = /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/giu;
const LETTER_PATTERN = /\p{L}/u;

export type UntranslatedStringOccurrence = {
  file: string;
  line: number;
  text: string;
};

export type UntranslatedStringBaseline = {
  version: typeof BASELINE_VERSION;
  files: Record<string, number>;
};

export type UntranslatedStringScan = {
  occurrences: UntranslatedStringOccurrence[];
  scannedFileCount: number;
};

export type UntranslatedStringDrift = {
  actual: number;
  baseline: number;
  file: string;
};

export type UntranslatedStringDiff = {
  regressions: UntranslatedStringDrift[];
  stale: UntranslatedStringDrift[];
};

export type UntranslatedStringScanOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function normalizeVisibleText(text: string): string {
  return text.replace(JSX_ENTITY_PATTERN, ' ').replaceAll(/\s+/g, ' ').trim();
}

function isUserVisibleText(text: string): boolean {
  return LETTER_PATTERN.test(normalizeVisibleText(text));
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

/**
 * Find the deliberately narrow set of direct JSX strings this ratchet owns.
 * String-valued attributes and arbitrary expressions are props/code, not JSX
 * text, and stay outside the floor documented in the file header.
 */
export function findUntranslatedStrings(
  sourceText: string,
  file = 'fixture.tsx',
): UntranslatedStringOccurrence[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const occurrences: UntranslatedStringOccurrence[] = [];

  const record = (node: ts.Node, rawText: string): void => {
    const text = normalizeVisibleText(rawText);
    if (!isUserVisibleText(text)) {
      return;
    }

    occurrences.push({
      file,
      line: lineOf(sourceFile, node),
      text,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      record(node, node.text);
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      ts.isStringLiteralLike(node.expression)
    ) {
      record(node, node.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return occurrences;
}

export function scanUntranslatedStrings(
  options: UntranslatedStringScanOptions = {},
): UntranslatedStringScan {
  const rootDir = options.rootDir ?? ROOT;
  const files = globSync(options.includeGlobs ?? INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? IGNORE_GLOBS,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));
  const occurrences: UntranslatedStringOccurrence[] = [];

  for (const absolutePath of files) {
    const file = toPosix(path.relative(rootDir, absolutePath));
    const sourceText = readFileSync(absolutePath, 'utf8');
    occurrences.push(...findUntranslatedStrings(sourceText, file));
  }

  return { occurrences, scannedFileCount: files.length };
}

export function buildUntranslatedStringBaseline(
  occurrences: readonly UntranslatedStringOccurrence[],
): UntranslatedStringBaseline {
  const counts: Record<string, number> = {};

  for (const occurrence of occurrences) {
    counts[occurrence.file] = (counts[occurrence.file] ?? 0) + 1;
  }

  return {
    version: BASELINE_VERSION,
    files: Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export function totalUntranslatedStrings(
  baseline: UntranslatedStringBaseline,
): number {
  return Object.values(baseline.files).reduce((sum, count) => sum + count, 0);
}

export function diffUntranslatedStringBaseline(
  baseline: UntranslatedStringBaseline,
  actual: UntranslatedStringBaseline,
): UntranslatedStringDiff {
  const regressions: UntranslatedStringDrift[] = [];
  const stale: UntranslatedStringDrift[] = [];
  const files = new Set([
    ...Object.keys(baseline.files),
    ...Object.keys(actual.files),
  ]);

  for (const file of files) {
    const baselineCount = baseline.files[file] ?? 0;
    const actualCount = actual.files[file] ?? 0;

    if (actualCount > baselineCount) {
      regressions.push({
        actual: actualCount,
        baseline: baselineCount,
        file,
      });
    } else if (actualCount < baselineCount) {
      stale.push({
        actual: actualCount,
        baseline: baselineCount,
        file,
      });
    }
  }

  return {
    regressions: regressions.sort((left, right) =>
      left.file.localeCompare(right.file),
    ),
    stale: stale.sort((left, right) => left.file.localeCompare(right.file)),
  };
}

export function assertLowerOnlyBaselineUpdate(
  baseline: UntranslatedStringBaseline,
  actual: UntranslatedStringBaseline,
): void {
  const { regressions } = diffUntranslatedStringBaseline(baseline, actual);
  if (regressions.length > 0) {
    const details = regressions
      .map((entry) => `${entry.file} (${entry.baseline} -> ${entry.actual})`)
      .join(', ');
    throw new Error(
      `Refusing to update untranslated-string baseline: per-file count grew in ${details}.`,
    );
  }

  const baselineTotal = totalUntranslatedStrings(baseline);
  const actualTotal = totalUntranslatedStrings(actual);
  if (actualTotal >= baselineTotal) {
    throw new Error(
      `Refusing to update untranslated-string baseline: total must decrease (${baselineTotal} -> ${actualTotal}).`,
    );
  }
}

export function parseUntranslatedStringBaseline(
  raw: string,
): UntranslatedStringBaseline {
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    parsed.version !== BASELINE_VERSION ||
    !('files' in parsed) ||
    !parsed.files ||
    typeof parsed.files !== 'object' ||
    Array.isArray(parsed.files)
  ) {
    throw new Error(
      `Invalid untranslated-string baseline. Expected version ${BASELINE_VERSION}.`,
    );
  }

  for (const [file, count] of Object.entries(parsed.files)) {
    if (!file || !Number.isInteger(count) || Number(count) <= 0) {
      throw new Error(
        `Invalid untranslated-string baseline count for ${file || '<empty path>'}.`,
      );
    }
  }

  return parsed as UntranslatedStringBaseline;
}

export function serializeUntranslatedStringBaseline(
  baseline: UntranslatedStringBaseline,
): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

function readBaseline(): UntranslatedStringBaseline {
  return parseUntranslatedStringBaseline(readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(baseline: UntranslatedStringBaseline): void {
  writeFileSync(
    BASELINE_PATH,
    serializeUntranslatedStringBaseline(baseline),
    'utf8',
  );
}

function printDrift(
  scan: UntranslatedStringScan,
  diff: UntranslatedStringDiff,
): void {
  if (diff.regressions.length > 0) {
    process.stderr.write('\nNew direct JSX copy:\n');
    const regressedFiles = new Set(diff.regressions.map((entry) => entry.file));
    for (const occurrence of scan.occurrences.filter((entry) =>
      regressedFiles.has(entry.file),
    )) {
      process.stderr.write(
        `  ${occurrence.file}:${occurrence.line} — ${occurrence.text}\n`,
      );
    }
    process.stderr.write(`\n${UNTRANSLATED_STRING_FIX_HELP}\n`);
  }

  if (diff.stale.length > 0) {
    process.stderr.write(
      '\nThe untranslated-string baseline is stale. Keep the cleanup by running ' +
        '`bun run check:untranslated-strings --update-baseline` in this PR:\n',
    );
    for (const entry of diff.stale) {
      process.stderr.write(
        `  ${entry.file} — baseline ${entry.baseline}, actual ${entry.actual}\n`,
      );
    }
  }
}

function main(): void {
  const scan = scanUntranslatedStrings();
  const actual = buildUntranslatedStringBaseline(scan.occurrences);
  const actualTotal = totalUntranslatedStrings(actual);
  const baseline = readBaseline();

  if (process.argv.includes('--update-baseline')) {
    try {
      assertLowerOnlyBaselineUpdate(baseline, actual);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    }
    const baselineTotal = totalUntranslatedStrings(baseline);
    writeBaseline(actual);
    process.stdout.write(
      `Updated untranslated-string baseline: ${baselineTotal} -> ${actualTotal} direct JSX string(s).\n`,
    );
    return;
  }

  const diff = diffUntranslatedStringBaseline(baseline, actual);
  process.stdout.write(
    `Untranslated-string ratchet: ${actualTotal} direct JSX string(s) across ` +
      `${Object.keys(actual.files).length} file(s); ${scan.scannedFileCount} production JSX file(s) scanned.\n`,
  );

  if (diff.regressions.length === 0 && diff.stale.length === 0) {
    process.stdout.write('OK — no growth and no stale baseline entries.\n');
    return;
  }

  printDrift(scan, diff);
  process.exit(1);
}

if (import.meta.main) {
  main();
}
