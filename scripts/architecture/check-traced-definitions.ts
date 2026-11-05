/**
 * Guard: async work in the API is traced at its definition.
 *
 * Spans come from the definition, never from wrapping a call site, so every
 * caller gets the same span and the request context stamped on it
 * (`packages/libs/tracing`). Two rules over `apps/server/api/src`:
 *
 * 1. A class that Nest injects (`@Injectable()`, or any class in a
 *    `*.service.ts` file) with `async` methods carries `@Traced()` on the
 *    class, or on each of those methods (`@SentryTraced()` also counts).
 *    Controllers, guards, interceptors, middleware, pipes and filters are
 *    exempt: Sentry's Nest integration already spans them.
 * 2. An exported async function is defined through `traced(name, fn)`:
 *    `export const run = traced('run', async () => { ... })`.
 *
 * Exported async functions that predate the rule are ratcheted per file in
 * `traced-definitions.baseline.ts`. A file may never gain one, and an entry
 * that shrinks must be lowered (a stale entry also fails).
 *
 *   bun run check:traced-definitions
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { TRACED_DEFINITIONS_BASELINE } from './traced-definitions.baseline';

const DEFAULT_INCLUDE_GLOBS = ['apps/server/api/src/**/*.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/*.d.ts',
  '**/*.fixture.ts',
  '**/*.test-util.ts',
  '**/__tests__/**',
  '**/test/**',
  '**/node_modules/**',
];

/** Nest components that Sentry's Nest integration spans on its own. */
const AUTO_SPANNED_FILE_PATTERN =
  /\.(controller|guard|interceptor|middleware|filter|pipe)\.ts$/u;

const SERVICE_FILE_PATTERN = /\.service\.ts$/u;

const TRACING_DECORATORS: ReadonlySet<string> = new Set([
  'SentryTraced',
  'Traced',
]);

const LIFECYCLE_HOOKS: ReadonlySet<string> = new Set([
  'beforeApplicationShutdown',
  'onApplicationBootstrap',
  'onApplicationShutdown',
  'onModuleDestroy',
  'onModuleInit',
]);

export type TracedDefinitionViolation = {
  allowed: number;
  count: number;
  file: string;
  kind: 'untraced-class' | 'untraced-export' | 'stale-baseline';
  message: string;
  name?: string;
};

export type TracedDefinitionOptions = {
  baseline?: Readonly<Record<string, number>>;
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type UntracedClass = {
  file: string;
  methods: string[];
  name: string;
};

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function decoratorNames(node: ts.HasDecorators): string[] {
  return (ts.getDecorators(node) ?? []).flatMap((decorator) => {
    const name = decoratorName(decorator);
    return name ? [name] : [];
  });
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
    : false;
}

function hasTracingDecorator(node: ts.HasDecorators): boolean {
  return decoratorNames(node).some((name) => TRACING_DECORATORS.has(name));
}

function memberName(member: ts.ClassElement): string {
  return member.name && ts.isIdentifier(member.name)
    ? member.name.text
    : (member.name?.getText() ?? '<anonymous>');
}

function isAsyncFunctionLike(node: ts.Node | undefined): boolean {
  return Boolean(
    node &&
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      hasModifier(node, ts.SyntaxKind.AsyncKeyword),
  );
}

/** Async methods of a class that still need a span, by name. */
export function findUntracedMethods(classNode: ts.ClassDeclaration): string[] {
  if (hasTracingDecorator(classNode)) {
    return [];
  }

  return classNode.members.flatMap((member) => {
    if (
      !ts.isMethodDeclaration(member) ||
      !member.body ||
      member.asteriskToken ||
      !hasModifier(member, ts.SyntaxKind.AsyncKeyword) ||
      hasModifier(member, ts.SyntaxKind.StaticKeyword) ||
      LIFECYCLE_HOOKS.has(memberName(member)) ||
      hasTracingDecorator(member)
    ) {
      return [];
    }
    return [memberName(member)];
  });
}

function isInjectedClass(classNode: ts.ClassDeclaration, file: string) {
  return (
    SERVICE_FILE_PATTERN.test(file) ||
    decoratorNames(classNode).includes('Injectable')
  );
}

/** Exported async functions not defined through `traced(...)`, by name. */
export function findUntracedExports(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) &&
      statement.body &&
      !statement.asteriskToken &&
      hasModifier(statement, ts.SyntaxKind.AsyncKeyword)
    ) {
      names.push(statement.name?.text ?? 'default');
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (isAsyncFunctionLike(declaration.initializer)) {
          names.push(declaration.name.getText(sourceFile));
        }
      }
    }
  }

  return names;
}

export function findUntracedClasses(
  sourceFile: ts.SourceFile,
  file: string,
): UntracedClass[] {
  if (AUTO_SPANNED_FILE_PATTERN.test(file)) {
    return [];
  }

  const classes: UntracedClass[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && isInjectedClass(node, file)) {
      const methods = findUntracedMethods(node);
      if (methods.length > 0) {
        classes.push({
          file,
          methods,
          name: node.name?.text ?? '<anonymous>',
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return classes;
}

function listFiles(options: TracedDefinitionOptions, rootDir: string) {
  return globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();
}

function parse(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

export function runCheckTracedDefinitions(
  options: TracedDefinitionOptions = {},
): {
  scannedFileCount: number;
  totalBaselinedExports: number;
  violations: TracedDefinitionViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = options.baseline ?? TRACED_DEFINITIONS_BASELINE;
  const files = listFiles(options, rootDir);
  const exportCounts = new Map<string, number>();
  const violations: TracedDefinitionViolation[] = [];

  for (const filePath of files) {
    const file = normalizePath(path.relative(rootDir, filePath));
    const sourceFile = parse(filePath);

    for (const untraced of findUntracedClasses(sourceFile, file)) {
      violations.push({
        allowed: 0,
        count: untraced.methods.length,
        file,
        kind: 'untraced-class',
        message: `Add @Traced() (from @libs/tracing/traced) to class ${untraced.name}; untraced async methods: ${untraced.methods.join(', ')}.`,
        name: untraced.name,
      });
    }

    const exportCount = findUntracedExports(sourceFile).length;
    if (exportCount > 0) {
      exportCounts.set(file, exportCount);
    }
  }

  let totalBaselinedExports = 0;

  for (const [file, count] of exportCounts) {
    const allowed = baseline[file] ?? 0;
    totalBaselinedExports += Math.min(count, allowed);
    if (count > allowed) {
      violations.push({
        allowed,
        count,
        file,
        kind: 'untraced-export',
        message:
          "Define exported async functions as `export const name = traced('name', async (...) => { ... })` (from @libs/tracing/traced).",
      });
    } else if (count < allowed) {
      violations.push({
        allowed,
        count,
        file,
        kind: 'stale-baseline',
        message: `Baseline allows ${allowed} but only ${count} remain. Lower the entry in traced-definitions.baseline.ts.`,
      });
    }
  }

  for (const [file, allowed] of Object.entries(baseline)) {
    if (!exportCounts.has(file)) {
      violations.push({
        allowed,
        count: 0,
        file,
        kind: 'stale-baseline',
        message:
          'No untraced exported async function remains in this file. Remove the entry from traced-definitions.baseline.ts.',
      });
    }
  }

  return { scannedFileCount: files.length, totalBaselinedExports, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckTracedDefinitions();

  if (result.violations.length > 0) {
    console.error('Traced-definition violations found:');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file} (${violation.count}/${violation.allowed}) — ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Traced-definition guard passed: ${result.totalBaselinedExports} baselined exported async function(s) across ${result.scannedFileCount} source file(s).`,
  );
}
