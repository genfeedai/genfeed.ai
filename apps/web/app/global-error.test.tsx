import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GlobalError from './global-error';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

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

  it('marks its fallback for the route smoke suite (#5070)', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );
    expect(source).toContain('data-testid="error-boundary-fallback"');
  });

  it('opts the fallback document out of browser page translation', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('Boom')} reset={() => undefined} />,
    );

    expect(html).toContain('<html lang="en" translate="no">');
    expect(html).toContain('<meta content="notranslate" name="google"/>');
  });
});
