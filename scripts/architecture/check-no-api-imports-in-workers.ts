/**
 * Guardrail: workers must not import API source (#1090).
 *
 * The workers app historically deep-imported `@api/*` (aliased to
 * `apps/server/api/src`), coupling both runtimes into one modular monolith
 * compiled twice. Extraction is in progress: queue contracts live in
 * `@genfeedai/queue-contracts`, pure infra moves to `packages/libs`, and
 * entangled domain/integration services move to `@genfeedai/server-domain`.
 *
 * Until extraction completes, this guard is a ratchet:
 * - any `@api/*` specifier NOT in the baseline fails the build, and
 * - any baseline entry no longer in use fails the build until pruned,
 * so the baseline can only ever shrink. Once it is empty, delete
 * `workers-api-imports.baseline.ts` contents and this guard becomes a
 * plain ban.
 *
 * Unlike sibling guards, spec/test files are scanned too: test-only
 * `@api/*` imports still couple workers to API source.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { WORKERS_API_IMPORT_BASELINE } from './workers-api-imports.baseline';

const WORKERS_SRC_DIR = 'apps/server/workers/src';

const DEFAULT_INCLUDE_GLOBS = [`${WORKERS_SRC_DIR}/**/*.ts`];

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

const API_SPECIFIER_PATTERN = /^@api(\/|$)/;

const logger = {
  error: (message: string) =>
    console.error(`[CheckNoApiImportsInWorkers] ${message}`),
  log: (message: string) =>
    console.log(`[CheckNoApiImportsInWorkers] ${message}`),
};

export type ApiImportOccurrence = {
  file: string;
  line: number;
  specifier: string;
};

export type WorkersApiImportViolation =
  | {
      kind: 'new-import';
      message: string;
      occurrence: ApiImportOccurrence;
    }
  | {
      kind: 'stale-baseline-entry';
      message: string;
      specifier: string;
    };

export type WorkersApiImportResult = {
  occurrences: ApiImportOccurrence[];
  scannedFileCount: number;
  usedSpecifiers: string[];
  violations: WorkersApiImportViolation[];
};

export type WorkersApiImportOptions = {
  baseline?: readonly string[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function collectApiImportOccurrences(
  filePath: string,
  rootDir: string,
): ApiImportOccurrence[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const relativeFile = path.relative(rootDir, filePath);
  const occurrences: ApiImportOccurrence[] = [];

  const record = (node: ts.Node, specifier: string): void => {
    if (!API_SPECIFIER_PATTERN.test(specifier)) {
      return;
    }

    occurrences.push({
      file: relativeFile,
      line: getLine(sourceFile, node),
      specifier,
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      record(node, node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [argument] = node.arguments;

      if (argument && ts.isStringLiteralLike(argument)) {
        record(node, argument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return occurrences;
}

export function runCheckNoApiImportsInWorkers(
  options: WorkersApiImportOptions = {},
): WorkersApiImportResult {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = options.baseline ?? WORKERS_API_IMPORT_BASELINE;
  const includeGlobs = options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;

  const files = includeGlobs.flatMap((includeGlob) =>
    globSync(includeGlob, {
      absolute: true,
      cwd: rootDir,
      ignore: ignoreGlobs,
      nodir: true,
    }),
  );

  const occurrences = files.flatMap((file) =>
    collectApiImportOccurrences(file, rootDir),
  );
  const usedSpecifiers = [
    ...new Set(occurrences.map((occurrence) => occurrence.specifier)),
  ].sort();
  const baselineSet = new Set(baseline);
  const usedSet = new Set(usedSpecifiers);
  const violations: WorkersApiImportViolation[] = [];

  for (const occurrence of occurrences) {
    if (baselineSet.has(occurrence.specifier)) {
      continue;
    }

    violations.push({
      kind: 'new-import',
      message:
        'Workers must not add new @api/* imports. Import from @genfeedai/queue-contracts, @libs/*, or @genfeedai/server-domain instead (#1090).',
      occurrence,
    });
  }

  for (const specifier of baseline) {
    if (usedSet.has(specifier)) {
      continue;
    }

    violations.push({
      kind: 'stale-baseline-entry',
      message:
        'Baseline entry is no longer imported by workers. Remove it from workers-api-imports.baseline.ts so the ratchet only ever shrinks (#1090).',
      specifier,
    });
  }

  return {
    occurrences,
    scannedFileCount: files.length,
    usedSpecifiers,
    violations,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckNoApiImportsInWorkers();

  if (process.argv.includes('--print-baseline')) {
    console.log(JSON.stringify(result.usedSpecifiers, null, 2));
    process.exit(0);
  }

  if (result.violations.length > 0) {
    logger.error('Workers @api import boundary violations found:');

    for (const violation of result.violations) {
      if (violation.kind === 'new-import') {
        logger.error(
          `${violation.occurrence.file}:${violation.occurrence.line} imports '${violation.occurrence.specifier}' — ${violation.message}`,
        );
        continue;
      }

      logger.error(`'${violation.specifier}' — ${violation.message}`);
    }

    process.exit(1);
  }

  logger.log(
    `Workers @api import ratchet passed. ${result.usedSpecifiers.length}/${WORKERS_API_IMPORT_BASELINE.length} baselined specifier(s) still in use across ${result.scannedFileCount} file(s).`,
  );
}
