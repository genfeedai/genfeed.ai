/**
 * Ratchet: importing `registerBillingAccountScope` from `tenant-context`
 * must not grow unnoticed (#5217, MAJOR 2; import-based redesign, #5231
 * hardening).
 *
 * `registerBillingAccountScope` marks a `billingAccountId` as an active
 * `BillingAccountScope` for the runtime tenant guard — it takes a raw
 * string, with none of `resolveBillingAccountAccess`'s org-scoped proof
 * behind it. Only `resolveBillingAccountAccessInternal`, the resolution
 * logic shared by `resolveBillingAccountAccess` and
 * `BillingAccountsService.resolveForOrganization` (both in
 * `apps/server/api/src/tenancy/billing-account-scope.ts`), may call it.
 *
 * This scans **imports**, not call expressions. A call-expression scan is
 * trivially defeated:
 *
 *   import { registerBillingAccountScope as reg } from '@libs/prisma/tenant-context';
 *   const fn = reg; fn(id);                          // aliased, still a call — caught by luck
 *   obj[someKey](id);                                 // element access — never a plain `foo(` call
 *   somewhere.pass(reg);                               // passed as a value, called far away
 *   import * as tenantContext from '@libs/prisma/tenant-context';
 *   tenantContext.registerBillingAccountScope(id);     // namespace import, property access
 *
 * every one of these still needs to *get* the function from the module
 * before doing anything with it, so gating on the import itself is strictly
 * more robust: any named import of `registerBillingAccountScope` (by its
 * original exported name, regardless of a local `as` alias) or any
 * namespace import of the whole module is flagged, full stop — we don't try
 * to prove the imported binding is actually invoked. New occurrences fail CI
 * until reviewed into the baseline; stale baseline entries fail until
 * removed, so the list can only shrink without an explicit change.
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

// Matches the path-aliased specifier (`@libs/prisma/tenant-context`) and any
// relative specifier ending in `tenant-context` (`./tenant-context`,
// `../tenant-context`, `../../libs/prisma/tenant-context`, …) — every way
// this module can legitimately be imported in this repo.
const TENANT_CONTEXT_MODULE_PATTERN = /(?:^|\/)tenant-context$/;

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
      kind: 'new-import';
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

/**
 * Whether an import declaration's module specifier is (or resolves to) the
 * `tenant-context` module — the only place `registerBillingAccountScope` is
 * exported from.
 */
function isTenantContextModuleSpecifier(specifierText: string): boolean {
  return TENANT_CONTEXT_MODULE_PATTERN.test(specifierText);
}

/**
 * Whether an import specifier names `registerBillingAccountScope` as the
 * binding it pulls in — by the module's *exported* name, so
 * `{ registerBillingAccountScope as reg }` is still caught even though the
 * local binding is called `reg` everywhere else in the file.
 */
function importsHatchByExportedName(specifier: ts.ImportSpecifier): boolean {
  const exportedName = specifier.propertyName?.text ?? specifier.name.text;
  return exportedName === HATCH_NAME;
}

function collectOccurrences(
  filePath: string,
  rootDir: string,
): BillingAccountScopeRegistrationOccurrence[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = parseSourceFile(filePath, sourceText, true);
  const file = normalizePath(path.relative(rootDir, filePath));
  const occurrences: BillingAccountScopeRegistrationOccurrence[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isTenantContextModuleSpecifier(node.moduleSpecifier.text)
    ) {
      const namedBindings = node.importClause?.namedBindings;

      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        // `import * as ns from '@libs/prisma/tenant-context'` — flags
        // unconditionally. We can't statically rule out `ns.registerBillingAccountScope(...)`,
        // `ns['registerBillingAccountScope'](...)`, or passing `ns` on as a
        // value, so any namespace import of this module is itself the
        // violation.
        occurrences.push({ file, line: lineOf(node) });
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const specifier of namedBindings.elements) {
          if (importsHatchByExportedName(specifier)) {
            occurrences.push({ file, line: lineOf(node) });
            break;
          }
        }
      }
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
      kind: 'new-import',
      message:
        'New import of registerBillingAccountScope (or a namespace import of tenant-context) ' +
        'outside the reviewed baseline. Only resolveBillingAccountAccessInternal ' +
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
        'Baseline entry no longer imports registerBillingAccountScope from tenant-context. Remove ' +
        'it from scripts/architecture/billing-account-scope-registration.baseline.ts so the ratchet ' +
        'only ever shrinks (#5217).',
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
      'check:billing-account-scope-registration — import ratchet failed:',
    );
    for (const violation of result.violations) {
      if (violation.kind === 'new-import') {
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
      `${result.occurrences.length} baselined registerBillingAccountScope import(s), no new ones.`,
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
