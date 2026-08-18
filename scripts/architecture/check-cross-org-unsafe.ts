/**
 * Ratchet: production `crossOrgUnsafe(` call sites must not grow unnoticed.
 *
 * The Prisma CLOUD tenant guard throws on unscoped tenant-model queries unless
 * the named hatch wraps the work. That hatch is greppable on purpose. New call
 * sites fail CI until they are added to the baseline with review; stale
 * baseline entries fail until they are removed, so the list can only shrink
 * without an explicit change.
 *
 *   bun run check:cross-org-unsafe
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  CROSS_ORG_UNSAFE_BASELINE,
  type CrossOrgUnsafeBaselineEntry,
} from './cross-org-unsafe.baseline';

const HATCH_NAME = 'crossOrgUnsafe';

const DEFAULT_INCLUDE_GLOBS = ['apps/**/*.ts', 'packages/**/*.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/fixtures/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
  '**/__tests__/**',
  '**/tests/**',
];

export type CrossOrgUnsafeOccurrence = {
  file: string;
  line: number;
};

export type CrossOrgUnsafeViolation =
  | {
      kind: 'new-call';
      message: string;
      occurrence: CrossOrgUnsafeOccurrence;
    }
  | {
      kind: 'stale-baseline-entry';
      entry: CrossOrgUnsafeBaselineEntry;
      message: string;
    };

export type CrossOrgUnsafeCheckOptions = {
  baseline?: readonly CrossOrgUnsafeBaselineEntry[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type CrossOrgUnsafeCheckResult = {
  occurrences: CrossOrgUnsafeOccurrence[];
  scannedFileCount: number;
  violations: CrossOrgUnsafeViolation[];
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function entryKey(entry: CrossOrgUnsafeBaselineEntry): string {
  return `${entry.file}:${entry.line}`;
}

function isHatchCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === HATCH_NAME;
  }

  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === HATCH_NAME
  );
}

function collectOccurrences(
  filePath: string,
  rootDir: string,
): CrossOrgUnsafeOccurrence[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const file = normalizePath(path.relative(rootDir, filePath));
  const occurrences: CrossOrgUnsafeOccurrence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isHatchCallee(node.expression)) {
      occurrences.push({
        file,
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return occurrences;
}

export function runCrossOrgUnsafeCheck(
  options: CrossOrgUnsafeCheckOptions = {},
): CrossOrgUnsafeCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseline = options.baseline ?? CROSS_ORG_UNSAFE_BASELINE;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort(compareText);

  const occurrences = files
    .flatMap((file) => collectOccurrences(file, rootDir))
    .sort(
      (left, right) =>
        compareText(left.file, right.file) || left.line - right.line,
    );

  const baselineKeys = new Set(baseline.map(entryKey));
  const occurrenceKeys = new Set(occurrences.map(entryKey));
  const violations: CrossOrgUnsafeViolation[] = [];

  for (const occurrence of occurrences) {
    if (baselineKeys.has(entryKey(occurrence))) {
      continue;
    }

    violations.push({
      kind: 'new-call',
      message:
        'New crossOrgUnsafe() call site. This named hatch is the only CLOUD tenant-guard bypass; add it to scripts/architecture/cross-org-unsafe.baseline.ts with a reviewed reason, or scope the query with organizationId instead (#2364).',
      occurrence,
    });
  }

  for (const entry of baseline) {
    if (occurrenceKeys.has(entryKey(entry))) {
      continue;
    }

    violations.push({
      entry,
      kind: 'stale-baseline-entry',
      message:
        'Baseline entry is no longer a crossOrgUnsafe() call. Remove it from scripts/architecture/cross-org-unsafe.baseline.ts so the ratchet only ever shrinks (#2364).',
    });
  }

  return {
    occurrences,
    scannedFileCount: files.length,
    violations,
  };
}

function main(): void {
  const result = runCrossOrgUnsafeCheck();

  if (result.violations.length > 0) {
    console.error('check:cross-org-unsafe — hatch call-site ratchet failed:');
    for (const violation of result.violations) {
      if (violation.kind === 'new-call') {
        console.error(
          `- ${violation.occurrence.file}:${violation.occurrence.line} ${violation.message}`,
        );
        continue;
      }

      console.error(
        `- ${violation.entry.file}:${violation.entry.line} ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `check:cross-org-unsafe — ${result.scannedFileCount} files scanned; ` +
      `${result.occurrences.length} baselined crossOrgUnsafe() call site(s), no new ones.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:cross-org-unsafe — ${message}`);
    process.exit(1);
  }
}
