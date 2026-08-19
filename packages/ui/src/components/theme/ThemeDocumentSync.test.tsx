// @vitest-environment jsdom
'use client';

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeDocumentSync from './ThemeDocumentSync';

const matchMediaMock = vi.fn();
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

describe('ThemeDocumentSync', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    matchMediaMock.mockReset();
    matchMediaMock.mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: '(prefers-color-scheme: dark)',
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMediaMock,
    });
  });

  it('resolves system from the operating-system color scheme', () => {
    window.localStorage.setItem('theme', 'system');

    render(<ThemeDocumentSync />);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('honors an explicit preference over the operating system', () => {
    window.localStorage.setItem('theme', 'light');

    render(<ThemeDocumentSync />);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('normalizes an invalid preference to System', () => {
    window.localStorage.setItem('theme', 'sepia');

    render(<ThemeDocumentSync />);

    expect(window.localStorage.getItem('theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('repairs invalid cross-tab changes and keeps listening to the OS', () => {
    const mediaListeners = new Set<() => void>();
    let prefersDark = true;
    matchMediaMock.mockReturnValue({
      addEventListener: (_event: string, listener: () => void) =>
        mediaListeners.add(listener),
      get matches() {
        return prefersDark;
      },
      media: '(prefers-color-scheme: dark)',
      removeEventListener: (_event: string, listener: () => void) =>
        mediaListeners.delete(listener),
    });
    window.localStorage.setItem('theme', 'dark');
    render(<ThemeDocumentSync />);

    act(() => {
      window.localStorage.setItem('theme', 'sepia');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          newValue: 'sepia',
        }),
      );
    });

    expect(window.localStorage.getItem('theme')).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => {
      prefersDark = false;
      for (const listener of mediaListeners) listener();
    });

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to System when local storage is blocked', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new DOMException('Blocked', 'SecurityError');
        },
        setItem: () => {
          throw new DOMException('Blocked', 'SecurityError');
        },
      },
    });

    expect(() => render(<ThemeDocumentSync />)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses the deterministic fallback when media matching is blocked', () => {
    matchMediaMock.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => render(<ThemeDocumentSync />)).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
