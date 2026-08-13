import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createScanner,
  LanguageVariant,
  ScriptTarget,
  SyntaxKind,
} from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8');
}

function readPackageCode(relativePath: string): string {
  const scanner = createScanner(
    ScriptTarget.Latest,
    true,
    LanguageVariant.Standard,
    readPackageFile(relativePath),
  );
  const tokens: string[] = [];

  for (
    let token = scanner.scan();
    token !== SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    tokens.push(scanner.getTokenText());
  }

  return tokens.join(' ');
}

describe('workflows package build contract', () => {
  it('does not emit declarations or the UI bundle through tsup', () => {
    const tsupConfig = readPackageCode('tsup.config.ts');

    expect(tsupConfig).not.toMatch(/\bdts\s*:/);
    expect(tsupConfig).not.toContain('src/ui');
    expect(tsupConfig).toMatch(/\bsourcemap\s*:\s*false/);
    expect(tsupConfig).toContain('src/engine/index.ts');
  });

  it('keeps the default build as server JS plus tsc declarations', () => {
    const manifest = JSON.parse(readPackageFile('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts.build).toBe('tsup && bun run build:types');
    expect(manifest.scripts['build:server']).toBe('tsup');
    expect(manifest.scripts['build:types']).toBe(
      'tsc --emitDeclarationOnly -p tsconfig.types.json',
    );
    expect(manifest.scripts.build).not.toContain('prepend-use-client');
  });

  it('points UI exports at source so Next does not need dist/ui', () => {
    const manifest = JSON.parse(readPackageFile('package.json')) as {
      exports: Record<string, Record<string, string> | string>;
    };

    const uiExport = manifest.exports['./ui'];
    expect(uiExport).toMatchObject({
      default: './src/ui/index.ts',
      types: './src/ui/index.ts',
    });

    const uiStores = manifest.exports['./ui/stores'];
    expect(uiStores).toMatchObject({
      default: './src/ui/stores/index.ts',
      types: './src/ui/stores/index.ts',
    });
  });
});
