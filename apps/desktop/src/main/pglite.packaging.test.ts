import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const appPackageJsonPath = path.resolve(import.meta.dir, '../../package.json');
const appRoot = path.resolve(import.meta.dir, '../..');

describe('Desktop PGlite packaging', () => {
  it('keeps the PGlite dist files outside asar and importable at runtime', async () => {
    const packageJson = JSON.parse(
      fs.readFileSync(appPackageJsonPath, 'utf8'),
    ) as {
      build?: {
        asarUnpack?: string[];
      };
    };
    const distPath = path.join(
      appRoot,
      'node_modules/@electric-sql/pglite/dist',
    );

    expect(fs.existsSync(distPath)).toBe(true);
    expect(packageJson.build?.asarUnpack).toContain(
      'node_modules/@electric-sql/pglite/dist/**',
    );

    const imported = await import('@electric-sql/pglite');
    expect(typeof imported.PGlite).toBe('function');
  });
});
