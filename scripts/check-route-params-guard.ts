import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from './architecture/parse-source-file';

/**
 * Cache Components prerender route shells whose dynamic params are opaque
 * fallback strings (`%%drp:orgSlug:...`, #6303). `useParams` from
 * `next/navigation` hands those strings straight to links and API lookups, so
 * every consumer reads params through `useRouteParams`, which maps them to
 * `undefined`. A direct import brings the leak back.
 */

const INCLUDE_GLOBS = ['apps/app/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/tests/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  // The one allowed caller: the guard hook itself.
  'packages/hooks/navigation/use-route-params/use-route-params.ts',
];

export interface RouteParamsViolation {
  file: string;
  line: number;
  message: string;
}

export function findDirectUseParamsImports(
  file: string,
  source: string,
): RouteParamsViolation[] {
  if (!source.includes('useParams')) {
    return [];
  }

  const sourceFile = parseSourceFile(file, source, true, scriptKindFor(file));
  const violations: RouteParamsViolation[] = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'next/navigation'
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }

    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'useParams') {
        violations.push({
          file,
          line:
            sourceFile.getLineAndCharacterOfPosition(element.getStart()).line +
            1,
          message:
            "Import `useRouteParams` from '@genfeedai/hooks/navigation/use-route-params' instead of `useParams` from 'next/navigation'; it maps opaque `%%drp:` fallback params to undefined.",
        });
      }
    }
  }

  return violations;
}

function main(): void {
  const root = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    cwd: root,
    ignore: EXCLUDE_GLOBS,
  }).sort();

  const violations = files.flatMap((file) =>
    findDirectUseParamsImports(
      file.split(path.sep).join('/'),
      readFileSync(path.join(root, file), 'utf8'),
    ),
  );

  if (violations.length === 0) {
    console.log(
      '[CheckRouteParams] Route params are read through useRouteParams.',
    );
    return;
  }

  for (const violation of violations) {
    console.error(
      `[CheckRouteParams] ${violation.file}:${violation.line} ${violation.message}`,
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
