import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('website global error theme', () => {
  it('keeps the failed-root page on the dark studio canvas', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );

    expect(source).toContain('data-theme="dark"');
    expect(source).toContain("colorScheme: 'dark'");
    expect(source).not.toContain('ThemeDocumentSync');
    expect(source).not.toContain('ThemeDocumentBootstrapScript');
    expect(source).toContain('bg-background');
    expect(source).toContain('text-foreground');
  });

  // Next preloads this boundary on every page; a static logger import put
  // pino and the Sentry SDK in every visitor's first-load JavaScript.
  it('loads the logger only when there is an error to report', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/logger\.service/);
    expect(source).toContain("from '@services/core/deferred-logger'");
  });
});
