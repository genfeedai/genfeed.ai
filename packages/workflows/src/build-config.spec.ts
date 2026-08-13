import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tsupConfig from '../tsup.config';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageRoot, relativePath), 'utf8');
}

describe('workflows package build contract', () => {
  it('does not emit declarations or the UI bundle through tsup', () => {
    if (typeof tsupConfig === 'function' || Array.isArray(tsupConfig)) {
      throw new TypeError('Expected one static tsup configuration');
    }

    expect(tsupConfig).not.toHaveProperty('dts');
    expect(tsupConfig.entry).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^src\/ui(?:\/|$)/)]),
    );
    expect(tsupConfig.sourcemap).toBe(false);
    expect(tsupConfig.entry).toContain('src/engine/index.ts');
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
