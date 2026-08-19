import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/global-error.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
  });

  it('synchronizes the stored theme when the root layout has failed', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );

    expect(source).toContain('<ThemeDocumentSync />');
    expect(source).toContain('<ThemeDocumentBootstrapScript />');
    expect(source).toContain('<head>');
    expect(source).not.toContain('<html data-theme="dark"');
    expect(source).toContain('gf-studio-app');
  });
});
