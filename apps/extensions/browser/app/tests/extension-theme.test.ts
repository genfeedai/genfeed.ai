import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyExtensionTheme,
  hydrateExtensionThemeBeforePaint,
  watchExtensionTheme,
} from '~theme/extension-theme';

const originalMatchMedia = window.matchMedia;

function createModernMediaQuery(matches = false): MediaQueryList {
  return {
    addEventListener: vi.fn(),
    matches,
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
}

describe('extension theme adapter', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
      writable: true,
    });
    vi.mocked(originalMatchMedia).mockImplementation(() =>
      createModernMediaQuery(false),
    );
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    document.body.className = '';
    document.body.removeAttribute('data-theme');
    document.body.style.colorScheme = '';
  });

  it('hydrates an explicit stored preference before revealing extension chrome', async () => {
    let resolveStorage: (
      value: Record<string, { theme: 'dark' }>,
    ) => void = () => undefined;
    const storage = {
      get: vi.fn(
        () =>
          new Promise<Record<string, { theme: 'dark' }>>((resolve) => {
            resolveStorage = resolve;
          }),
      ),
    };

    const hydration = hydrateExtensionThemeBeforePaint(
      document,
      storage as Pick<chrome.storage.StorageArea, 'get'>,
    );

    expect(document.documentElement.style.visibility).toBe('hidden');
    expect(document.documentElement.dataset.theme).toBeUndefined();

    resolveStorage({ 'genfeed-settings': { theme: 'dark' } });

    await expect(hydration).resolves.toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.visibility).toBe('');
  });

  it('resolves system preference and applies it only to the extension document', () => {
    expect(applyExtensionTheme('system', true, document)).toBe('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.body.dataset.theme).toBe('dark');
  });

  it('keeps an explicit light preference when the system is dark', () => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    expect(applyExtensionTheme('light', true, document)).toBe('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('dark')).toBe(false);
  });

  it('updates a system theme live and removes its media listener on cleanup', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      addEventListener: vi.fn(
        (_event: string, nextListener: (event: MediaQueryListEvent) => void) => {
          listener = nextListener;
        },
      ),
      matches: false,
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;

    const cleanup = watchExtensionTheme('system', document, mediaQuery);
    expect(document.documentElement.dataset.theme).toBe('light');

    listener?.({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement.dataset.theme).toBe('dark');

    cleanup();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      'change',
      listener,
    );
  });

  it.each(['missing', 'throwing'] as const)(
    'falls back to dark when matchMedia is $caseType',
    (caseType) => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value:
          caseType === 'missing'
            ? undefined
            : vi.fn(() => {
                throw new Error('matchMedia unavailable');
              }),
        writable: true,
      });

      expect(() => watchExtensionTheme('system', document)).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
  );

  it('supports legacy MediaQueryList listeners', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      addListener: vi.fn((nextListener) => {
        listener = nextListener;
      }),
      matches: false,
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;

    const cleanup = watchExtensionTheme('system', document, mediaQuery);
    listener?.({ matches: true } as MediaQueryListEvent);

    expect(document.documentElement.dataset.theme).toBe('dark');
    cleanup();
    expect(mediaQuery.removeListener).toHaveBeenCalledWith(listener);
  });
});
