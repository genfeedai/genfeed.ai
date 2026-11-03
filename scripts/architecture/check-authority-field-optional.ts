/**
 * Ratchet: `@IsOptional()` on an authority field in a server DTO (#7137).
 *
 * `@IsOptional()` skips validation for JSON `null` as well as for an omitted
 * field, so `{"scopes": null}` or `{"expiresAt": null}` walks past the
 * validators that follow it. Services then read `null` as "not provided" and
 * fall back to a default, or as an explicit clear, and the same API-key
 * controller was patched twice in one day for it. On fields that set what a
 * caller may do (`scopes`, `expiresAt`, `allowedIps`, `role`,
 * `organizationId`) use `@IsOmittable()` from
 * `@api/helpers/validation/is-omittable.validator`: it skips `undefined` only,
 * so a present `null` reaches the type validators and is rejected with a 400.
 *
 * Existing offenders are baselined by file and property. New ones fail, stale
 * entries fail, and `check:ratchet-growth` stops a PR appending to the list.
 *
 *   bun run check:authority-field-optional
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  AUTHORITY_FIELD_OPTIONAL_BASELINE,
  type AuthorityFieldOptionalBaselineEntry,
} from './authority-field-optional.baseline';
import { parseSourceFile } from './parse-source-file';

export const AUTHORITY_FIELDS: ReadonlySet<string> = new Set([
  'allowedIps',
  'expiresAt',
  'organizationId',
  'role',
  'scopes',
]);

const DEFAULT_INCLUDE_GLOBS = ['apps/server/**/*.dto.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/dist/**',
  '**/node_modules/**',
  '**/coverage/**',
];

export type AuthorityFieldOccurrence = {
  file: string;
  line: number;
  property: string;
};

export type AuthorityFieldViolation =
  | {
      kind: 'new-optional-field';
      message: string;
      occurrence: AuthorityFieldOccurrence;
    }
  | {
      entry: AuthorityFieldOptionalBaselineEntry;
      kind: 'stale-baseline-entry';
      message: string;
    };

export type AuthorityFieldCheckOptions = {
  baseline?: readonly AuthorityFieldOptionalBaselineEntry[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type AuthorityFieldCheckResult = {
  occurrences: AuthorityFieldOccurrence[];
  scannedFileCount: number;
  violations: AuthorityFieldViolation[];
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

function entryKey(entry: { file: string; property: string }): string {
  return `${entry.file}\0${entry.property}`;
}

function isIsOptionalDecorator(decorator: ts.Decorator): boolean {
  const expression = decorator.expression;

  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'IsOptional'
  );
}

function propertyName(member: ts.PropertyDeclaration): string | undefined {
  return ts.isIdentifier(member.name) ? member.name.text : undefined;
}

function collectOccurrences(
  filePath: string,
  rootDir: string,
): AuthorityFieldOccurrence[] {
  const sourceFile = parseSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    true,
  );
  const file = normalizePath(path.relative(rootDir, filePath));
  const occurrences: AuthorityFieldOccurrence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyDeclaration(node)) {
      const property = propertyName(node);
      const hasIsOptional = ts
        .getDecorators(node)
        ?.some((decorator) => isIsOptionalDecorator(decorator));

      if (property && AUTHORITY_FIELDS.has(property) && hasIsOptional) {
        occurrences.push({
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          property,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return occurrences;
}

export function runAuthorityFieldOptionalCheck(
  options: AuthorityFieldCheckOptions = {},
): AuthorityFieldCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseline = options.baseline ?? AUTHORITY_FIELD_OPTIONAL_BASELINE;
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
        compareText(left.file, right.file) ||
        compareText(left.property, right.property),
    );

  const baselineKeys = new Set(baseline.map(entryKey));
  const occurrenceKeys = new Set(occurrences.map(entryKey));
  const violations: AuthorityFieldViolation[] = [];

  for (const occurrence of occurrences) {
    if (baselineKeys.has(entryKey(occurrence))) {
      continue;
    }

    violations.push({
      kind: 'new-optional-field',
      message: `@IsOptional() on \`${occurrence.property}\` lets JSON null skip validation. Use @IsOmittable() from '@api/helpers/validation/is-omittable.validator' so null is rejected.`,
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
        'Baseline entry no longer matches an @IsOptional() authority field. Remove it from scripts/architecture/authority-field-optional.baseline.ts so the ratchet only shrinks.',
    });
  }

  return { occurrences, scannedFileCount: files.length, violations };
}

function main(): void {
  const result = runAuthorityFieldOptionalCheck();

  if (result.violations.length > 0) {
    console.error('check:authority-field-optional failed (#7137):');
    for (const violation of result.violations) {
      const location =
        violation.kind === 'new-optional-field'
          ? `${violation.occurrence.file}:${violation.occurrence.line}`
          : `${violation.entry.file} (${violation.entry.property})`;
      console.error(`- ${location} ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `check:authority-field-optional — ${result.scannedFileCount} DTO files scanned; ` +
      `${result.occurrences.length} baselined @IsOptional() authority field(s), no new ones.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:authority-field-optional — ${message}`);
    process.exit(1);
  }
}
