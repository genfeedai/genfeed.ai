/**
 * Ratchet: `registerBillingAccountScope(` call sites must not grow unnoticed
 * (#5217, MAJOR 2).
 *
 * `registerBillingAccountScope` marks a `billingAccountId` as an active
 * `BillingAccountScope` for the runtime tenant guard — it takes a raw
 * string, with none of `resolveBillingAccountAccess`'s org-scoped proof
 * behind it. Only `resolveBillingAccountAccessInternal`, the resolution
 * logic shared by `resolveBillingAccountAccess` and
 * `BillingAccountsService.resolveForOrganization` (both in
 * `apps/server/api/src/tenancy/billing-account-scope.ts`), may call it. New
 * call sites fail CI until they are added to the baseline with review; stale
 * baseline entries fail until removed, so the list can only shrink without
 * an explicit change.
 *
 *   bun run check:billing-account-scope-registration
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  BILLING_ACCOUNT_SCOPE_REGISTRATION_BASELINE,
  type BillingAccountScopeRegistrationBaselineEntry,
} from './billing-account-scope-registration.baseline';
import { parseSourceFile } from './parse-source-file';

const HATCH_NAME = 'registerBillingAccountScope';

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

export type BillingAccountScopeRegistrationOccurrence = {
  file: string;
  line: number;
};

export type BillingAccountScopeRegistrationViolation =
  | {
      kind: 'new-call';
      message: string;
      occurrence: BillingAccountScopeRegistrationOccurrence;
    }
  | {
      entry: BillingAccountScopeRegistrationBaselineEntry;
      kind: 'stale-baseline-entry';
      message: string;
    };

export type BillingAccountScopeRegistrationCheckOptions = {
  baseline?: readonly BillingAccountScopeRegistrationBaselineEntry[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type BillingAccountScopeRegistrationCheckResult = {
  occurrences: BillingAccountScopeRegistrationOccurrence[];
  scannedFileCount: number;
  violations: BillingAccountScopeRegistrationViolation[];
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

function entryKey(entry: BillingAccountScopeRegistrationBaselineEntry): string {
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
): BillingAccountScopeRegistrationOccurrence[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = parseSourceFile(filePath, sourceText, true);
  const file = normalizePath(path.relative(rootDir, filePath));
  const occurrences: BillingAccountScopeRegistrationOccurrence[] = [];

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

export function runBillingAccountScopeRegistrationCheck(
  options: BillingAccountScopeRegistrationCheckOptions = {},
): BillingAccountScopeRegistrationCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseline =
    options.baseline ?? BILLING_ACCOUNT_SCOPE_REGISTRATION_BASELINE;
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
  const violations: BillingAccountScopeRegistrationViolation[] = [];

  for (const occurrence of occurrences) {
    if (baselineKeys.has(entryKey(occurrence))) {
      continue;
    }

    violations.push({
      kind: 'new-call',
      message:
        'New registerBillingAccountScope() call site. Only resolveBillingAccountAccessInternal ' +
        '(apps/server/api/src/tenancy/billing-account-scope.ts) may register a billing-account ' +
        'scope — a raw billingAccountId string has no org-scoped proof behind it. Route through ' +
        'resolveBillingAccountAccess / resolveLiveBillingAccount instead, or add this to ' +
        'scripts/architecture/billing-account-scope-registration.baseline.ts with a reviewed reason (#5217).',
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
        'Baseline entry is no longer a registerBillingAccountScope() call. Remove it from ' +
        'scripts/architecture/billing-account-scope-registration.baseline.ts so the ratchet only ' +
        'ever shrinks (#5217).',
    });
  }

  return {
    occurrences,
    scannedFileCount: files.length,
    violations,
  };
}

function main(): void {
  const result = runBillingAccountScopeRegistrationCheck();

  if (result.violations.length > 0) {
    console.error(
      'check:billing-account-scope-registration — call-site ratchet failed:',
    );
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
    `check:billing-account-scope-registration — ${result.scannedFileCount} files scanned; ` +
      `${result.occurrences.length} baselined registerBillingAccountScope() call site(s), no new ones.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:billing-account-scope-registration — ${message}`);
    process.exit(1);
  }
}
