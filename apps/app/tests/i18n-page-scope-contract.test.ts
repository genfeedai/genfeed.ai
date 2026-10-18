import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const configPath = path.join(appRoot, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, appRoot);
const moduleCache = ts.createModuleResolutionCache(
  appRoot,
  (fileName) => fileName,
  parsed.options,
);

function eagerImports(entry: string): Set<string> {
  const files = new Set<string>();
  const visit = (fileName: string) => {
    if (
      files.has(fileName) ||
      fileName.includes('/node_modules/') ||
      fileName.endsWith('.d.ts')
    ) {
      return;
    }
    files.add(fileName);
    if (!/\.[jt]sx?$/.test(fileName)) return;
    const source = ts.createSourceFile(
      fileName,
      readFileSync(fileName, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of source.statements) {
      if (
        !(
          ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
        ) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        (ts.isImportDeclaration(statement)
          ? statement.importClause?.isTypeOnly
          : statement.isTypeOnly)
      ) {
        continue;
      }
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        if (
          !clause?.name &&
          clause?.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every((item) => item.isTypeOnly)
        ) {
          continue;
        }
      }
      const resolution = ts.resolveModuleName(
        statement.moduleSpecifier.text,
        fileName,
        parsed.options,
        ts.sys,
        moduleCache,
      ).resolvedModule;
      if (resolution) visit(resolution.resolvedFileName);
    }
  };
  visit(path.join(appRoot, entry));
  return files;
}

describe('app translation module boundaries', () => {
  it.each(['app/layout.tsx', 'app/(protected)/protected-layout-client.tsx'])(
    'keeps product page catalogs out of the eager %s graph',
    (entry) => {
      const files = [...eagerImports(entry)];
      const pageCatalogs = files.filter((fileName) =>
        fileName.startsWith(path.join(appRoot, 'messages/en/pages')),
      );
      expect(pageCatalogs).toEqual([]);
      expect(files).not.toContain(path.join(appRoot, 'i18n/messages.ts'));
    },
  );
});
