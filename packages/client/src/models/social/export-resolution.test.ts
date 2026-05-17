import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import packageJson from '../../../package.json';

describe('social model package export', () => {
  it('exposes the social directory index subpath', () => {
    expect(packageJson.exports['./models/social']).toEqual({
      default: './dist/models/social/index.js',
      types: './dist/models/social/index.d.ts',
    });
    expect(packageJson.typesVersions['*']['models/social']).toEqual([
      'dist/models/social/index.d.ts',
    ]);
  });

  it('uses a Node-compatible extension in the social barrel export', () => {
    const sourcePath = fileURLToPath(new URL('./index.ts', import.meta.url));
    expect(readFileSync(sourcePath, 'utf8')).toContain(
      "export * from './link.model.js';",
    );
  });
});
