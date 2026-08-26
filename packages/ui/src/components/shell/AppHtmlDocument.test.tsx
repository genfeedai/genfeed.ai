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
    expect(html).not.toContain('data-scroll-behavior');
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

  it('emits real connection hints as link tags, not inert meta tags', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument fontVariables="font-test" initialTheme="dark">
        <main>Content</main>
      </AppHtmlDocument>,
    );

    // `<meta name="preconnect">` is ignored by every browser — only the link
    // form opens a socket.
    expect(html).not.toContain('name="preconnect"');
    expect(html).toContain(
      '<link crossorigin="anonymous" href="https://api.genfeed.ai" rel="preconnect"/>',
    );
    expect(html).toContain(
      '<link crossorigin="anonymous" href="https://cdn.genfeed.ai" rel="preconnect"/>',
    );
    expect(html).toContain(
      '<link href="https://notifications.genfeed.ai" rel="dns-prefetch"/>',
    );
  });

  it('lets an app override the hinted origins', () => {
    const html = renderToStaticMarkup(
      <AppHtmlDocument
        dnsPrefetch={[]}
        fontVariables="font-test"
        initialTheme="dark"
        preconnect={['https://example.test']}
      >
        <main>Content</main>
      </AppHtmlDocument>,
    );

    expect(html).toContain('href="https://example.test" rel="preconnect"');
    expect(html).not.toContain('rel="dns-prefetch"');
  });

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
