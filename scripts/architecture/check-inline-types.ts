/**
 * Inline type ratchet for app route files.
 *
 * CLAUDE.md: "No inline interfaces — use packages/props/ or
 * packages/contracts/src/interfaces/". This scans production .ts and .tsx
 * files under apps/app/app for top-level interfaces and type aliases containing
 * object literals, including unions and wrappers. Move those declarations into
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
import { parseSourceFile } from './parse-source-file';

const ROOT = path.resolve(import.meta.dirname, '../..');
const INCLUDE_GLOBS = ['apps/app/app/**/*.{ts,tsx}'];
const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/*.spec.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  '**/*.stories.{ts,tsx}',
  '**/*.d.ts',
  '**/__tests__/**',
  '**/__fixtures__/**',
];

interface InlineTypeFinding {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

function containsObjectLiteral(node: ts.Node): boolean {
  return (
    ts.isTypeLiteralNode(node) ||
    ts.forEachChild(node, containsObjectLiteral) === true
  );
}

export function findInlineTypes(
  file: string,
  source: string,
): InlineTypeFinding[] {
  const sourceFile = parseSourceFile(
    file,
    source,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: InlineTypeFinding[] = [];
  for (const statement of sourceFile.statements) {
    const isInterface = ts.isInterfaceDeclaration(statement);
    const isObjectAlias =
      ts.isTypeAliasDeclaration(statement) &&
      containsObjectLiteral(statement.type);
    if (!isInterface && !isObjectAlias) continue;
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      statement.getStart(sourceFile),
    );
    findings.push({ file, line: line + 1, name: statement.name.text });
  }
  return findings;
}

export function listInlineTypeFiles(root = ROOT): string[] {
  return globSync(INCLUDE_GLOBS, {
    cwd: root,
    ignore: IGNORE_GLOBS,
    nodir: true,
  }).sort();
}

function main(): void {
  const files = listInlineTypeFiles();
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
