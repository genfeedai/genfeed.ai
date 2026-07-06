import { readFileSync } from 'node:fs';
import { globSync } from 'glob';
import ts from 'typescript';

/**
 * Guard: forbid type-only imports for classes consumed through decorator
 * metadata in the NestJS server apps.
 *
 * The server compiles with `emitDecoratorMetadata` (tsconfig.server.decorators.json).
 * A class referenced in a decorated signature — a constructor parameter
 * (dependency injection) or a decorated method parameter (`@Body()`/`@Query()`/
 * `@Param()` ValidationPipe metatypes) — is read from `design:paramtypes` at
 * runtime. `import type` erases the value, so metadata degrades to
 * `undefined`/`Object`: DI injects garbage and validation silently skips.
 * Type-check passes either way, which is why this needs a dedicated guard.
 *
 * Escape hatch: a parameter with an explicit `@Inject(TOKEN)` decorator does
 * not rely on `design:paramtypes`, so `import type` there is correct — and is
 * the deliberate pattern for breaking require cycles (see
 * apps/server/api/src/collections/tasks/tasks.tokens.ts).
 */

const INCLUDE_GLOBS = ['apps/server/**/*.ts'];

const IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/fixtures/**',
  '**/generated/**',
];

type Violation = {
  file: string;
  line: number;
  typeName: string;
  context: 'constructor' | 'decorated-parameter';
  owner: string;
};

function collectTypeOnlyImports(
  sourceFile: ts.SourceFile,
): Map<string, number> {
  const typeOnly = new Map<string, number>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }
    const clause = statement.importClause;
    const line =
      sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    if (clause.isTypeOnly) {
      if (clause.name) {
        typeOnly.set(clause.name.text, line);
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          typeOnly.set(clause.namedBindings.name.text, line);
        } else {
          for (const specifier of clause.namedBindings.elements) {
            typeOnly.set(specifier.name.text, line);
          }
        }
      }
      continue;
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        if (specifier.isTypeOnly) {
          typeOnly.set(specifier.name.text, line);
        }
      }
    }
  }
  return typeOnly;
}

function headTypeName(typeNode: ts.TypeNode | undefined): string | null {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) {
    return null;
  }
  let name: ts.EntityName = typeNode.typeName;
  while (ts.isQualifiedName(name)) {
    name = name.left;
  }
  return name.text;
}

function parameterDecoratorNames(parameter: ts.ParameterDeclaration): string[] {
  const decorators = ts.getDecorators(parameter) ?? [];
  return decorators
    .map((decorator) => {
      const expression = decorator.expression;
      if (
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression)
      ) {
        return expression.expression.text;
      }
      if (ts.isIdentifier(expression)) {
        return expression.text;
      }
      return null;
    })
    .filter((name): name is string => name !== null);
}

/**
 * Route-parameter decorators whose argument is materialized through the
 * ValidationPipe metatype. `@Res`/`@Req`/`@Headers`/custom decorators either
 * bypass transformation or receive interfaces with no runtime value, so
 * type-only imports are correct there.
 */
const VALIDATED_PARAM_DECORATORS = new Set(['Body', 'Query', 'Param']);

function checkFile(file: string): Violation[] {
  const content = readFileSync(file, 'utf8');
  if (!content.includes('import type') && !/\{\s*type\s+/.test(content)) {
    return [];
  }
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const typeOnlyImports = collectTypeOnlyImports(sourceFile);
  if (typeOnlyImports.size === 0) {
    return [];
  }

  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isClassDeclaration(node) &&
      (ts.getDecorators(node)?.length ?? 0) > 0
    ) {
      const className = node.name?.text ?? '<anonymous class>';
      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
          for (const parameter of member.parameters) {
            // Any parameter decorator (@Inject, @InjectQueue, @Optional, ...)
            // supplies an explicit token or opts out of paramtype resolution.
            if ((ts.getDecorators(parameter)?.length ?? 0) > 0) {
              continue;
            }
            const typeName = headTypeName(parameter.type);
            if (!typeName || !typeOnlyImports.has(typeName)) {
              continue;
            }
            violations.push({
              context: 'constructor',
              file,
              line:
                sourceFile.getLineAndCharacterOfPosition(parameter.getStart())
                  .line + 1,
              owner: className,
              typeName,
            });
          }
        }
        if (ts.isMethodDeclaration(member)) {
          const methodName = ts.isIdentifier(member.name)
            ? member.name.text
            : '<method>';
          for (const parameter of member.parameters) {
            const decoratorNames = parameterDecoratorNames(parameter);
            if (
              !decoratorNames.some((name) =>
                VALIDATED_PARAM_DECORATORS.has(name),
              )
            ) {
              continue;
            }
            const typeName = headTypeName(parameter.type);
            // Class-validator DTOs are classes named *Dto by repo convention;
            // other names (interfaces, framework types) have no runtime value
            // to import, so a type-only import is the only correct spelling.
            if (!typeName?.endsWith('Dto') || !typeOnlyImports.has(typeName)) {
              continue;
            }
            violations.push({
              context: 'decorated-parameter',
              file,
              line:
                sourceFile.getLineAndCharacterOfPosition(parameter.getStart())
                  .line + 1,
              owner: `${className}.${methodName}`,
              typeName,
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
  const files = globSync(INCLUDE_GLOBS, { ignore: IGNORE_GLOBS, nodir: true });
  const violations = files.flatMap(checkFile);

  if (violations.length === 0) {
    console.log(
      `check:di-value-imports — ${files.length} files scanned, no violations.`,
    );
    return;
  }

  console.error(
    `check:di-value-imports — ${violations.length} violation(s). ` +
      'The server compiles with emitDecoratorMetadata: a type-only import used in a decorated ' +
      'signature erases the runtime value from design:paramtypes, so Nest DI injects undefined ' +
      'and ValidationPipe skips validation while type-check still passes.',
  );
  for (const violation of violations) {
    const hint =
      violation.context === 'constructor'
        ? 'use a value import, or inject via an explicit @Inject(TOKEN) with a useExisting provider'
        : 'use a value import so the ValidationPipe metatype survives compilation';
    console.error(
      `  ${violation.file}:${violation.line} — '${violation.typeName}' is imported with 'import type' ` +
        `but consumed via decorator metadata in ${violation.owner} (${violation.context}); ${hint}.`,
    );
  }
  process.exit(1);
}

main();
