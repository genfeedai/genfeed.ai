/**
 * Guardrail: the shared server package must never import API source (#1090).
 *
 * API and workers are allowed to depend on `@genfeedai/server`; the reverse
 * dependency would recreate the coupling this package exists to remove.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const SERVER_SRC_DIR = 'apps/server/server/src';
const API_DIR = 'apps/server/api';
const SERVER_PACKAGE_JSON = 'apps/server/server/package.json';

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

const API_ALIAS_PATTERN =
  /^(?:@api(?:\/|$)|@api-(?:root|scripts|test)(?:\/|$)|@billing-providers(?:\/|$)|@genfeedai\/api(?:\/|$))/;

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

export type ServerPackageBoundaryViolation = {
  file: string;
  line?: number;
  message: string;
  specifier: string;
};

export type ServerPackageBoundaryResult = {
  scannedFileCount: number;
  violations: ServerPackageBoundaryViolation[];
};

export type ServerPackageBoundaryOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  packageJsonPath?: string;
  rootDir?: string;
};

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function resolvesIntoApiSource(
  filePath: string,
  rootDir: string,
  specifier: string,
): boolean {
  if (API_ALIAS_PATTERN.test(specifier)) {
    return true;
  }

  const normalizedSpecifier = specifier.replaceAll('\\', '/');
  if (normalizedSpecifier.includes('apps/server/api')) {
    return true;
  }

  if (!specifier.startsWith('.')) {
    return false;
  }

  const resolved = path.resolve(path.dirname(filePath), specifier);
  const apiDir = path.resolve(rootDir, API_DIR);
  return resolved === apiDir || resolved.startsWith(`${apiDir}${path.sep}`);
}

function collectModuleSpecifiers(
  filePath: string,
  rootDir: string,
): ServerPackageBoundaryViolation[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const relativeFile = path.relative(rootDir, filePath);
  const violations: ServerPackageBoundaryViolation[] = [];

  const record = (node: ts.Node, specifier: string): void => {
    if (!resolvesIntoApiSource(filePath, rootDir, specifier)) {
      return;
    }

    violations.push({
      file: relativeFile,
      line: getLine(sourceFile, node),
      message:
        'Shared server code must not import API source. Invert the dependency through a server-owned contract/token or keep the adapter in API.',
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
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      record(node, node.moduleReference.expression.text);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      record(node, node.argument.literal.text);
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
        record(node, argument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function collectManifestViolations(
  packageJsonPath: string,
  rootDir: string,
): ServerPackageBoundaryViolation[] {
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as Record<string, unknown>;
  const violations: ServerPackageBoundaryViolation[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = packageJson[section];
    if (
      !dependencies ||
      typeof dependencies !== 'object' ||
      !('@genfeedai/api' in dependencies)
    ) {
      continue;
    }

    violations.push({
      file: path.relative(rootDir, packageJsonPath),
      message: `Shared server package must not declare @genfeedai/api in ${section}.`,
      specifier: '@genfeedai/api',
    });
  }

  return violations;
}

export function runCheckServerPackageBoundary(
  options: ServerPackageBoundaryOptions = {},
): ServerPackageBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const includeGlobs = options.includeGlobs ?? [`${SERVER_SRC_DIR}/**/*.ts`];
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const packageJsonPath = path.resolve(
    rootDir,
    options.packageJsonPath ?? SERVER_PACKAGE_JSON,
  );
  const files = includeGlobs.flatMap((includeGlob) =>
    globSync(includeGlob, {
      absolute: true,
      cwd: rootDir,
      ignore: ignoreGlobs,
      nodir: true,
    }),
  );
  const violations = files.flatMap((file) =>
    collectModuleSpecifiers(file, rootDir),
  );

  violations.push(...collectManifestViolations(packageJsonPath, rootDir));

  return {
    scannedFileCount: files.length,
    violations,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckServerPackageBoundary();

  if (result.violations.length > 0) {
    console.error('Shared server package boundary violations found:');
    for (const violation of result.violations) {
      const location = violation.line
        ? `${violation.file}:${violation.line}`
        : violation.file;
      console.error(
        `- ${location} imports '${violation.specifier}' — ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Shared server package boundary passed across ${result.scannedFileCount} source file(s).`,
  );
}
