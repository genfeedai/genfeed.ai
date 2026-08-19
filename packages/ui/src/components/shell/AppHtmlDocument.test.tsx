import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppHtmlDocument from './AppHtmlDocument';

function executeDocumentBootstrap(
  markup: string,
  prefersDark: boolean,
  storedTheme?: string,
) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body></body></html>',
    {
      runScripts: 'outside-only',
      url: 'https://genfeed.ai',
    },
  );

  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: prefersDark }),
  });

  if (storedTheme !== undefined) {
    dom.window.localStorage.setItem('theme', storedTheme);
  }

  const container = dom.window.document.createElement('div');
  container.innerHTML = markup;

  for (const script of container.querySelectorAll('script')) {
    dom.window.eval(script.textContent ?? '');
  }

  return dom;
}

describe('AppHtmlDocument', () => {
  it('leaves System unresolved so CSS and the head bootstrap can follow the host', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument fontVariables="font-test" initialTheme="system">
        <main>Content</main>
      </AppHtmlDocument>,
    );

    expect(html).not.toContain('data-theme="dark"');
    expect(html).not.toContain('data-theme="light"');
    expect(html).toContain('color-scheme:light dark');
    expect(html).toContain('id="genfeed-theme-document-bootstrap"');
    expect(html.indexOf('genfeed-theme-document-bootstrap')).toBeLessThan(
      html.indexOf('<body'),
    );
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

  it('applies an explicit stored Light preference before paint even when the OS is dark', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument fontVariables="font-test" initialTheme="system">
        <main>Content</main>
      </AppHtmlDocument>,
    );
    const dom = executeDocumentBootstrap(html, true, 'light');

    expect(dom.window.document.documentElement.dataset.theme).toBe('light');
    expect(dom.window.document.documentElement.style.colorScheme).toBe('light');
  });

  it('resolves stored System against a light operating-system scheme before paint', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument fontVariables="font-test" initialTheme="system">
        <main>Content</main>
      </AppHtmlDocument>,
    );
    const dom = executeDocumentBootstrap(html, false, 'system');

    expect(dom.window.localStorage.getItem('theme')).toBe('system');
    expect(dom.window.document.documentElement.dataset.theme).toBe('light');
  });
});
