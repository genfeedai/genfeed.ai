// @vitest-environment jsdom

import { runInNewContext } from 'node:vm';
import { act, render, waitFor } from '@testing-library/react';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { ThemeProvider } from 'next-themes';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeStorageBootstrapScript } from './ThemeBootstrapScript';

const storedValues = new Map<string, string>();
const storageMock = {
  clear: () => storedValues.clear(),
  getItem: (key: string) => storedValues.get(key) ?? null,
  key: (index: number) => [...storedValues.keys()][index] ?? null,
  get length() {
    return storedValues.size;
  },
  removeItem: (key: string) => storedValues.delete(key),
  setItem: (key: string, value: string) => storedValues.set(key, value),
};

describe('theme runtime recovery', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        addListener: () => undefined,
        matches: true,
        removeListener: () => undefined,
      }),
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('recovers an invalid cross-tab value through the actual provider', async () => {
    window.localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem
        storageKey="theme"
      >
        <ThemeCookieSync />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );

    act(() => {
      window.localStorage.setItem('theme', 'sepia');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          newValue: 'sepia',
        }),
      );
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('theme')).toBe('system');
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it.each(['missing', 'throwing'] as const)(
    'keeps the actual provider safe when matchMedia is %s',
    (failureMode) => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value:
          failureMode === 'missing'
            ? undefined
            : () => {
                throw new DOMException('Blocked', 'SecurityError');
              },
      });
      window.localStorage.setItem('theme', 'system');
      const markup = renderToStaticMarkup(
        <ThemeStorageBootstrapScript storageKey="theme" />,
      );
      const container = document.createElement('div');
      container.innerHTML = markup;
      runInNewContext(container.querySelector('script')?.textContent ?? '', {
        window,
      });

      expect(() =>
        render(
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="system"
            enableSystem
            storageKey="theme"
          >
            <ThemeCookieSync />
          </ThemeProvider>,
        ),
      ).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
  );
});
