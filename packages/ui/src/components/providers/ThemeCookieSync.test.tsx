import { act, render, waitFor } from '@testing-library/react';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useThemeMock } = vi.hoisted(() => ({
  useThemeMock: vi.fn(),
}));
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

vi.mock('next-themes', () => ({
  useTheme: useThemeMock,
}));

vi.mock('@genfeedai/contracts/constants', () => ({
  DEFAULT_THEME: 'system',
  THEME_COOKIE_MAX_AGE: 31536000,
  THEME_COOKIE_NAME: 'theme',
  THEME_STORAGE_KEY: 'theme',
  isThemePreference: (value: unknown) =>
    value === 'system' || value === 'light' || value === 'dark',
}));

describe('ThemeCookieSync', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
    document.cookie = 'theme=; path=/; max-age=0';
    window.localStorage.clear();
    useThemeMock.mockReset();
  });

  it.each(['system', 'light', 'dark'])(
    'persists the raw %s preference instead of its resolved snapshot',
    async (theme) => {
      useThemeMock.mockReturnValue({
        resolvedTheme: 'dark',
        setTheme: vi.fn(),
        theme,
      });

      const { container } = render(<ThemeCookieSync />);

      expect(container).toBeEmptyDOMElement();
      await waitFor(() => expect(document.cookie).toContain(`theme=${theme}`));
    },
  );

  it('normalizes an invalid runtime theme to System', async () => {
    const setTheme = vi.fn();
    window.localStorage.setItem('theme', 'solarized');
    useThemeMock.mockReturnValue({
      resolvedTheme: 'dark',
      setTheme,
      theme: 'solarized',
    });

    render(<ThemeCookieSync />);

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('system'));
    expect(window.localStorage.getItem('theme')).toBe('system');
    await waitFor(() => expect(document.cookie).not.toContain('solarized'));
  });

  it('repairs an invalid cross-tab storage update', async () => {
    const setTheme = vi.fn();
    useThemeMock.mockReturnValue({
      resolvedTheme: 'dark',
      setTheme,
      theme: 'dark',
    });

    render(<ThemeCookieSync />);

    act(() => {
      window.localStorage.setItem('theme', 'sepia');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          newValue: 'sepia',
        }),
      );
    });

    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('system'));
    expect(window.localStorage.getItem('theme')).toBe('system');
  });

  it('preserves a valid raw System preference', async () => {
    const setTheme = vi.fn();
    window.localStorage.setItem('theme', 'system');
    useThemeMock.mockReturnValue({
      resolvedTheme: 'dark',
      setTheme,
      theme: 'system',
    });

    render(<ThemeCookieSync />);

    await waitFor(() => expect(document.cookie).toContain('theme=system'));
    expect(window.localStorage.getItem('theme')).toBe('system');
    expect(setTheme).not.toHaveBeenCalled();
  });
});
