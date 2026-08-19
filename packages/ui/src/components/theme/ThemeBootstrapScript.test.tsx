// @vitest-environment jsdom

import { JSDOM } from 'jsdom';
import { ThemeProvider } from 'next-themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ThemeDocumentBootstrapScript,
  ThemeStorageBootstrapScript,
} from './ThemeBootstrapScript';

function createDocument(prefersDark: boolean) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://genfeed.ai',
  });

  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: prefersDark }),
  });

  return dom;
}

function executeScripts(dom: JSDOM, markup: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = markup;

  for (const script of container.querySelectorAll('script')) {
    dom.window.eval(script.textContent ?? '');
  }
}

describe('ThemeStorageBootstrapScript', () => {
  it('repairs invalid storage before the actual next-themes bootstrap runs', () => {
    const markup = renderToStaticMarkup(
      <>
        <ThemeStorageBootstrapScript storageKey="theme" />
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          storageKey="theme"
        >
          <div />
        </ThemeProvider>
      </>,
    );
    const dom = createDocument(true);
    dom.window.localStorage.setItem('theme', 'sepia');

    executeScripts(dom, markup);

    expect(dom.window.localStorage.getItem('theme')).toBe('system');
    expect(dom.window.document.documentElement.dataset.theme).toBe('dark');
  });

  it('preserves raw System storage for next-themes to resolve', () => {
    const markup = renderToStaticMarkup(
      <>
        <ThemeStorageBootstrapScript storageKey="theme" />
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          storageKey="theme"
        >
          <div />
        </ThemeProvider>
      </>,
    );
    const dom = createDocument(false);
    dom.window.localStorage.setItem('theme', 'system');

    executeScripts(dom, markup);

    expect(dom.window.localStorage.getItem('theme')).toBe('system');
    expect(dom.window.document.documentElement.dataset.theme).toBe('light');
  });
});

describe('ThemeDocumentBootstrapScript', () => {
  it('applies storage before a root error document can paint', () => {
    const markup = renderToStaticMarkup(<ThemeDocumentBootstrapScript />);
    const dom = createDocument(false);
    dom.window.document.documentElement.dataset.theme = 'dark';
    dom.window.localStorage.setItem('theme', 'light');

    executeScripts(dom, markup);

    expect(dom.window.document.documentElement.dataset.theme).toBe('light');
    expect(dom.window.document.documentElement.style.colorScheme).toBe('light');
  });

  it('normalizes invalid storage and resolves System before paint', () => {
    const markup = renderToStaticMarkup(<ThemeDocumentBootstrapScript />);
    const dom = createDocument(true);
    dom.window.localStorage.setItem('theme', 'sepia');

    executeScripts(dom, markup);

    expect(dom.window.localStorage.getItem('theme')).toBe('system');
    expect(dom.window.document.documentElement.dataset.theme).toBe('dark');
  });

  it('still resolves System before paint when storage throws', () => {
    const markup = renderToStaticMarkup(<ThemeDocumentBootstrapScript />);
    const dom = createDocument(true);
    Object.defineProperty(dom.window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new dom.window.DOMException('Blocked', 'SecurityError');
      },
    });

    expect(() => executeScripts(dom, markup)).not.toThrow();
    expect(dom.window.document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses the deterministic fallback when media matching throws', () => {
    const markup = renderToStaticMarkup(<ThemeDocumentBootstrapScript />);
    const dom = createDocument(false);
    Object.defineProperty(dom.window, 'matchMedia', {
      configurable: true,
      value: () => {
        throw new dom.window.DOMException('Blocked', 'SecurityError');
      },
    });

    expect(() => executeScripts(dom, markup)).not.toThrow();
    expect(dom.window.document.documentElement.dataset.theme).toBe('dark');
  });
});
