/**
 * Guardrail: BullMQ processors must run in the workers service, not the API.
 *
 * The API may still register queues as a producer, but it must not declare
 * BullMQ @Processor classes or WorkerHost implementations.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const ROOT_DIR = process.cwd();
const API_SRC_DIR = 'apps/server/api/src';

const SOURCE_GLOBS = [`${API_SRC_DIR}/**/*.ts`];
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

type ImportBindings = {
  processorNames: Set<string>;
  workerHostNames: Set<string>;
};

type Violation = {
  file: string;
  line: number;
  message: string;
};

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function collectBullMqImports(sourceFile: ts.SourceFile): ImportBindings {
  const processorNames = new Set<string>();
  const workerHostNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@nestjs/bullmq'
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const localName = element.name.text;

      if (importedName === 'Processor') {
        processorNames.add(localName);
      }

      if (importedName === 'WorkerHost') {
        workerHostNames.add(localName);
      }
    }
  }

  return { processorNames, workerHostNames };
}

function getDecoratorIdentifier(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return expression.expression.text;
  }

  return null;
}

function collectViolations(filePath: string): Violation[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = collectBullMqImports(sourceFile);
  const relativeFile = path.relative(ROOT_DIR, filePath);
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      const decorators = ts.canHaveDecorators(node)
        ? (ts.getDecorators(node) ?? [])
        : [];

      for (const decorator of decorators) {
        const decoratorName = getDecoratorIdentifier(decorator);

        if (decoratorName && imports.processorNames.has(decoratorName)) {
          violations.push({
            file: relativeFile,
            line: getLine(sourceFile, decorator),
            message:
              'BullMQ @Processor classes must live under apps/server/workers/src/processors.',
          });
        }
      }

      for (const heritageClause of node.heritageClauses ?? []) {
        if (heritageClause.token !== ts.SyntaxKind.ExtendsKeyword) {
          continue;
        }

        for (const heritageType of heritageClause.types) {
          const expression = heritageType.expression;

          if (
            ts.isIdentifier(expression) &&
            imports.workerHostNames.has(expression.text)
          ) {
            violations.push({
              file: relativeFile,
              line: getLine(sourceFile, heritageType),
              message:
                'WorkerHost implementations must live under apps/server/workers/src/processors.',
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return violations;
}

function main(): void {
  const files = SOURCE_GLOBS.flatMap((sourceGlob) =>
    globSync(sourceGlob, {
      absolute: true,
      cwd: ROOT_DIR,
      ignore: IGNORE_GLOBS,
      nodir: true,
    }),
  );

  const violations = files.flatMap(collectViolations);

  if (violations.length === 0) {
    console.log('No API BullMQ processor classes detected.');
    return;
  }

  console.error('Disallowed BullMQ processor class(es) detected in API:\n');

  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
  }

  process.exit(1);
}

main();
