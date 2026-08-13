import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8');
}

describe('workflows package build contract', () => {
  it('does not emit declarations or the UI bundle through tsup', () => {
    const tsupConfig = readPackageFile('tsup.config.ts');

    expect(tsupConfig).not.toMatch(/\bdts\s*:/);
    expect(tsupConfig).not.toContain('src/ui');
    expect(tsupConfig).toContain('sourcemap: false');
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
