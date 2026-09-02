/**
 * Guardrail: the public repo may only keep narrow marketplace integration
 * DTOs (#2896). Private marketplace packages and persistence/workflow
 * models belong in the marketplace service, not this repository.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const MARKETPLACE_CONTRACT_DIR =
  'packages/contracts/src/interfaces/marketplace';

const ALLOWED_MARKETPLACE_CONTRACT_FILES = new Set([
  `${MARKETPLACE_CONTRACT_DIR}/checkout.interface.ts`,
  `${MARKETPLACE_CONTRACT_DIR}/index.ts`,
  `${MARKETPLACE_CONTRACT_DIR}/listing.interface.ts`,
  `${MARKETPLACE_CONTRACT_DIR}/seller.interface.ts`,
]);

function isAllowedMarketplaceContractFile(file: string): boolean {
  return (
    ALLOWED_MARKETPLACE_CONTRACT_FILES.has(file) ||
    (file.startsWith(`${MARKETPLACE_CONTRACT_DIR}/`) &&
      /\.(?:spec|test)\.ts$/u.test(file))
  );
}

const PRIVATE_TYPE_NAMES = new Set([
  'IDownloadResponse',
  'IListing',
  'IListingQueryParams',
  'IListingSnapshot',
  'IListingWithOwnership',
  'IPurchase',
  'IPurchaseQueryParams',
  'IPurchaseReview',
  'IPurchaseWithListing',
  'ISeller',
  'ISellerProfile',
  'ISellerSocial',
]);

const PRIVATE_PACKAGE_SPECIFIER_PATTERN =
  /^(?:@genfeedai\/marketplace(?:\/|$)|@marketplace(?:\/|$)|marketplace\.genfeed\.ai(?:\/|$))/u;

const CHECK_FILES = new Set([
  'scripts/architecture/check-marketplace-boundary.ts',
  'scripts/architecture/check-marketplace-boundary.test.ts',
]);

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx}',
  'packages/**/*.{cjs,js,mjs,ts,tsx}',
  'scripts/**/*.{cjs,js,mjs,ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

export type MarketplaceBoundaryViolation = {
  file: string;
  line?: number;
  message: string;
  specifier: string;
};

export type MarketplaceBoundaryResult = {
  scannedFileCount: number;
  violations: MarketplaceBoundaryViolation[];
};

export type MarketplaceBoundaryOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function isPrivatePackageSpecifier(specifier: string): boolean {
  return PRIVATE_PACKAGE_SPECIFIER_PATTERN.test(specifier);
}

function collectContractFileViolations(
  rootDir: string,
): MarketplaceBoundaryViolation[] {
  const files = globSync(`${MARKETPLACE_CONTRACT_DIR}/**/*`, {
    cwd: rootDir,
    nodir: true,
  }).map((file) => normalizePath(file));

  return files
    .filter((file) => !isAllowedMarketplaceContractFile(file))
    .map((file) => ({
      file,
      message:
        'Only versioned marketplace preview and checkout DTOs may live in the public interfaces package.',
      specifier: file,
    }));
}

function collectManifestViolations(
  file: string,
  rootDir: string,
): MarketplaceBoundaryViolation[] {
  const packageJson = JSON.parse(
    readFileSync(path.join(rootDir, file), 'utf8'),
  ) as Record<string, unknown>;
  const violations: MarketplaceBoundaryViolation[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = packageJson[section];
    if (!dependencies || typeof dependencies !== 'object') {
      continue;
    }

    for (const specifier of Object.keys(
      dependencies as Record<string, unknown>,
    )) {
      if (!isPrivatePackageSpecifier(specifier)) {
        continue;
      }

      violations.push({
        file,
        message: `Private marketplace packages must not be declared in ${section}.`,
        specifier,
      });
    }
  }

  return violations;
}

function collectSourceViolations(
  file: string,
  rootDir: string,
): MarketplaceBoundaryViolation[] {
  if (CHECK_FILES.has(file)) {
    return [];
  }

  const sourceText = readFileSync(path.join(rootDir, file), 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const violations: MarketplaceBoundaryViolation[] = [];

  const recordSpecifier = (node: ts.Node, specifier: string): void => {
    if (!isPrivatePackageSpecifier(specifier)) {
      return;
    }

    violations.push({
      file,
      line: getLine(sourceFile, node),
      message:
        'Private marketplace packages must not be imported. Use the public preview and checkout DTOs.',
      specifier,
    });
  };

  const recordTypeName = (node: ts.Node, typeName: string): void => {
    if (!PRIVATE_TYPE_NAMES.has(typeName)) {
      return;
    }

    violations.push({
      file,
      line: getLine(sourceFile, node),
      message:
        'Marketplace persistence and workflow models must not be defined or imported in this repository.',
      specifier: typeName,
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      recordSpecifier(node, node.moduleSpecifier.text);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      recordSpecifier(node, node.moduleReference.expression.text);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      recordSpecifier(node, node.argument.literal.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) {
        recordSpecifier(node, argument.text);
      }
    }

    if (ts.isImportSpecifier(node)) {
      recordTypeName(node, (node.propertyName ?? node.name).text);
    }

    if (ts.isExportSpecifier(node)) {
      recordTypeName(node, (node.propertyName ?? node.name).text);
    }

    if (ts.isInterfaceDeclaration(node)) {
      recordTypeName(node, node.name.text);
    }

    if (ts.isTypeAliasDeclaration(node)) {
      recordTypeName(node, node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function runCheckMarketplaceBoundary(
  options: MarketplaceBoundaryOptions = {},
): MarketplaceBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map((file) => normalizePath(file))
    .sort((left, right) => left.localeCompare(right));

  const violations = files.flatMap((file) => {
    if (path.basename(file) === 'package.json') {
      return collectManifestViolations(file, rootDir);
    }

    return collectSourceViolations(file, rootDir);
  });

  if (existsSync(path.join(rootDir, MARKETPLACE_CONTRACT_DIR))) {
    violations.push(...collectContractFileViolations(rootDir));
  }

  const packageJsonFiles = globSync('**/package.json', {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).map((file) => normalizePath(file));

  for (const file of packageJsonFiles) {
    if (files.includes(file)) {
      continue;
    }

    violations.push(...collectManifestViolations(file, rootDir));
  }

  return { scannedFileCount: files.length, violations };
}

if (import.meta.main) {
  const result = runCheckMarketplaceBoundary();

  if (result.violations.length > 0) {
    console.error('Marketplace public-boundary violations:');
    for (const violation of result.violations) {
      const location = violation.line
        ? `${violation.file}:${violation.line}`
        : violation.file;
      console.error(
        `- ${location} [${violation.specifier}] ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Marketplace public-boundary passed across ${result.scannedFileCount} source file(s).`,
  );
}
