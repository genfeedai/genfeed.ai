import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const ROOT_DIR = process.cwd();

const SOURCE_GLOBS = [
  'apps/**/*.{ts,tsx,js,jsx}',
  'packages/**/*.{ts,tsx,js,jsx}',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
];

const ALLOWED_RELATIVE_IMPORT_FILES = new Set([
  'apps/web/admin/instrumentation.ts',
  'apps/web/app/instrumentation.ts',
  'apps/web/chatgpt/instrumentation.ts',
  'apps/web/marketplace/instrumentation.ts',
  'apps/web/website/instrumentation.ts',
]);

function isAllowedRelativeImportFile(relativePath: string): boolean {
  return (
    ALLOWED_RELATIVE_IMPORT_FILES.has(relativePath) ||
    relativePath.includes('.test.') ||
    relativePath.includes('.spec.') ||
    relativePath.includes('/tests/') ||
    relativePath.endsWith('/next-env.d.ts')
  );
}

type Violation = {
  file: string;
  line: number;
  specifier: string;
};

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function isParentTraversalSpecifier(specifier: string): boolean {
  return specifier.startsWith('../');
}

function collectViolations(filePath: string): Violation[] {
  const relativePath = path.relative(ROOT_DIR, filePath);

  if (isAllowedRelativeImportFile(relativePath)) {
    return [];
  }

  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );

  const violations: Violation[] = [];

  const pushViolation = (node: ts.Node, specifier: string) => {
    if (
      !isRelativeSpecifier(specifier) ||
      !isParentTraversalSpecifier(specifier)
    ) {
      return;
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    violations.push({
      file: relativePath,
      line: line + 1,
      specifier,
    });
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      pushViolation(node.moduleSpecifier, node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      pushViolation(node.arguments[0], node.arguments[0].text);
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      pushViolation(node.argument.literal, node.argument.literal.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return violations;
}

function main() {
  const files = globSync(SOURCE_GLOBS, {
    absolute: true,
    cwd: ROOT_DIR,
    ignore: IGNORE_GLOBS,
    nodir: true,
  });

  const violations = files.flatMap((filePath) => collectViolations(filePath));

  if (violations.length === 0) {
    console.log('No disallowed relative imports or re-exports found.');
    return;
  }

  console.error(
    'Alias import violations found. Replace relative import/export specifiers with workspace aliases.',
  );

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} (${violation.specifier})`,
    );
  }

  process.exit(1);
}

main();
