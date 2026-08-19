import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppHtmlDocument from './AppHtmlDocument';

describe('AppHtmlDocument', () => {
  it('renders a deterministic fallback while allowing both system schemes', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument fontVariables="font-test" initialTheme="system">
        <main>Content</main>
      </AppHtmlDocument>,
    );

    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('color-scheme:light dark');
  });

  it.each(['light', 'dark'] as const)(
    'renders an explicit %s preference directly',
    (theme) => {
      const html = renderToStaticMarkup(
        <AppHtmlDocument fontVariables="font-test" initialTheme={theme}>
          <main>Content</main>
        </AppHtmlDocument>,
      );

      expect(html).toContain(`data-theme="${theme}"`);
      expect(html).toContain(`color-scheme:${theme}`);
    },
  );
});
