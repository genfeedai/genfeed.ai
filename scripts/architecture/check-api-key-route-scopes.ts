/**
 * Ratchet: a mutating API route that names no API-key scope (#9129, #9200).
 *
 * `ApiKeyAuthGuard` holds a route without `@RequiredScopes` to a baseline: any
 * one resource write scope is enough to call it. A key limited to
 * `images:create` therefore reaches every undecorated POST, PUT, PATCH and
 * DELETE. A new mutating handler must say which scope it needs
 * (`@RequiredScopes(...)`, on the handler or the class) or that it changes no
 * tenant data (`@ApiKeyReadAccess()`).
 *
 * Existing handlers are baselined by file, class and method. New ones fail,
 * stale entries fail, and `check:ratchet-growth` stops a PR appending to the
 * list.
 *
 *   bun run check:api-key-route-scopes
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { API_KEY_ROUTE_SCOPE_BASELINE } from './api-key-route-scopes.baseline';
import { parseSourceFile } from './parse-source-file';

const DEFAULT_INCLUDE_GLOBS = ['apps/server/api/src/**/*.controller.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/dist/**',
  '**/node_modules/**',
];

const MUTATING_METHOD_DECORATORS: ReadonlySet<string> = new Set([
  'Delete',
  'Patch',
  'Post',
  'Put',
]);

const SCOPE_DECORATORS: ReadonlySet<string> = new Set([
  'ApiKeyReadAccess',
  'RequiredScopes',
]);

export type UnscopedRoute = {
  file: string;
  /** `<file>::<Class>.<method>`, the baseline key. */
  key: string;
  line: number;
};

export type ApiKeyRouteScopeViolation =
  | { kind: 'new-unscoped-route'; message: string; route: UnscopedRoute }
  | { entry: string; kind: 'stale-baseline-entry'; message: string };

export type ApiKeyRouteScopeCheckOptions = {
  baseline?: readonly string[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type ApiKeyRouteScopeCheckResult = {
  mutatingRouteCount: number;
  scannedFileCount: number;
  unscopedRoutes: UnscopedRoute[];
  violations: ApiKeyRouteScopeViolation[];
};

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
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

function collectRoutes(
  filePath: string,
  rootDir: string,
): { mutating: number; unscoped: UnscopedRoute[] } {
  const sourceFile = parseSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    true,
  );
  const file = path.relative(rootDir, filePath).replaceAll('\\', '/');
  const unscoped: UnscopedRoute[] = [];
  let mutating = 0;

  sourceFile.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) {
      return;
    }
    const classDecorators = decoratorNames(node);
    if (!classDecorators.includes('Controller')) {
      return;
    }
    const isClassScoped = classDecorators.some((name) =>
      SCOPE_DECORATORS.has(name),
    );

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
        continue;
      }
      const names = decoratorNames(member);
      if (!names.some((name) => MUTATING_METHOD_DECORATORS.has(name))) {
        continue;
      }
      mutating += 1;
      if (isClassScoped || names.some((name) => SCOPE_DECORATORS.has(name))) {
        continue;
      }
      unscoped.push({
        file,
        key: `${file}::${node.name.text}.${member.name.text}`,
        line:
          sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile))
            .line + 1,
      });
    }
  });

  return { mutating, unscoped };
}

export function runApiKeyRouteScopeCheck(
  options: ApiKeyRouteScopeCheckOptions = {},
): ApiKeyRouteScopeCheckResult {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseline = options.baseline ?? API_KEY_ROUTE_SCOPE_BASELINE;
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort(compareText);

  let mutatingRouteCount = 0;
  const unscopedRoutes: UnscopedRoute[] = [];
  for (const file of files) {
    const found = collectRoutes(file, rootDir);
    mutatingRouteCount += found.mutating;
    unscopedRoutes.push(...found.unscoped);
  }
  unscopedRoutes.sort((left, right) => compareText(left.key, right.key));

  const baselined = new Set(baseline);
  const found = new Set(unscopedRoutes.map((route) => route.key));
  const violations: ApiKeyRouteScopeViolation[] = [];

  for (const route of unscopedRoutes) {
    if (!baselined.has(route.key)) {
      violations.push({
        kind: 'new-unscoped-route',
        message:
          'mutating route names no API-key scope. Add @RequiredScopes(...) for the resource it changes, or @ApiKeyReadAccess() when it changes no tenant data. Do not add it to the baseline.',
        route,
      });
    }
  }
  for (const entry of baseline) {
    if (!found.has(entry)) {
      violations.push({
        entry,
        kind: 'stale-baseline-entry',
        message:
          'Baseline entry no longer matches an unscoped mutating route. Remove it from scripts/architecture/api-key-route-scopes.baseline.ts so the ratchet only shrinks.',
      });
    }
  }

  return {
    mutatingRouteCount,
    scannedFileCount: files.length,
    unscopedRoutes,
    violations,
  };
}

function main(): void {
  const result = runApiKeyRouteScopeCheck();

  if (result.violations.length > 0) {
    console.error('check:api-key-route-scopes failed (#9129):');
    for (const violation of result.violations) {
      const location =
        violation.kind === 'new-unscoped-route'
          ? `${violation.route.file}:${violation.route.line} ${violation.route.key.split('::')[1]}`
          : violation.entry;
      console.error(`- ${location} ${violation.message}`);
    }
    process.exit(1);
  }

  console.log(
    `check:api-key-route-scopes — ${result.scannedFileCount} controllers scanned; ` +
      `${result.unscopedRoutes.length} of ${result.mutatingRouteCount} mutating routes baselined without a scope, no new ones.`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:api-key-route-scopes — ${message}`);
    process.exit(1);
  }
}
