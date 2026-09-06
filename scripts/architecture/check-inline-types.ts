/**
 * Inline type ratchet for app route files.
 *
 * CLAUDE.md: "No inline interfaces — use packages/props/ or
 * packages/contracts/src/interfaces/". This scans every production .tsx file
 * under apps/app/app and fails when a module declares a top-level `interface`
 * or an object-literal `type X = { ... }` alias. Move the declaration into
 * packages/props (props, state, action unions) or packages/contracts
 * (domain shapes) and import it back with `import type`.
 *
 * Unions of string literals, `typeof`-derived aliases, and mapped/conditional
 * types stay allowed: they describe local values, not component contracts.
 *
 *   bun run check:inline-types
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import * as ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../..');
const INCLUDE_GLOBS = ['apps/app/app/**/*.tsx'];
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/*.spec.tsx',
  '**/*.test.tsx',
  '**/*.stories.tsx',
  '**/__tests__/**',
  '**/__fixtures__/**',
];

interface InlineTypeFinding {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

function isObjectLiteralAlias(node: ts.TypeAliasDeclaration): boolean {
  return ts.isTypeLiteralNode(node.type);
}

export function findInlineTypes(
  file: string,
  source: string,
): InlineTypeFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: InlineTypeFinding[] = [];
  for (const statement of sourceFile.statements) {
    const isInterface = ts.isInterfaceDeclaration(statement);
    const isObjectAlias =
      ts.isTypeAliasDeclaration(statement) && isObjectLiteralAlias(statement);
    if (!isInterface && !isObjectAlias) continue;
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      statement.getStart(sourceFile),
    );
    findings.push({ file, line: line + 1, name: statement.name.text });
  }
  return findings;
}

function main(): void {
  const files = globSync(INCLUDE_GLOBS, {
    cwd: ROOT,
    ignore: IGNORE_GLOBS,
    nodir: true,
  }).sort();
  const findings = files.flatMap((file) =>
    findInlineTypes(file, readFileSync(path.join(ROOT, file), 'utf8')),
  );

  if (findings.length === 0) {
    console.log(
      `Inline type check: 0 inline interfaces across ${files.length} route files.`,
    );
    return;
  }

  console.error(
    `Inline type check: ${findings.length} inline interface(s)/object type(s) in route files.\n`,
  );
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line} — ${finding.name}`);
  }
  console.error(
    '\nMove each declaration into packages/props/<area>/<name>.props.ts (or packages/contracts/src/interfaces for domain shapes) and import it with `import type`.',
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
