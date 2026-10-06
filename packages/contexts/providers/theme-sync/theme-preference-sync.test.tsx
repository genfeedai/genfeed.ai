// @vitest-environment jsdom
'use client';

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemePreferenceSync from './theme-preference-sync';

const useCurrentUserMock = vi.fn();
const setThemeMock = vi.fn();
const useThemeMock = vi.fn();

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}));

describe('ThemePreferenceSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThemeMock.mockReturnValue({ setTheme: setThemeMock, theme: 'dark' });
  });

  it('applies the stored account preference on a new device', () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: { settings: { theme: 'system' } },
    });

    render(<ThemePreferenceSync />);

    expect(setThemeMock).toHaveBeenCalledWith('system');
  });

  it('does not reapply the active preference', () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: { settings: { theme: 'dark' } },
    });

    render(<ThemePreferenceSync />);

    expect(setThemeMock).not.toHaveBeenCalled();
  });

  it('reapplies the account preference when the browser cache arrives late', () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: { settings: { theme: 'dark' } },
    });
    useThemeMock.mockReturnValue({ setTheme: setThemeMock, theme: 'system' });
    const view = render(<ThemePreferenceSync />);

    expect(setThemeMock).toHaveBeenCalledWith('dark');

    setThemeMock.mockClear();
    useThemeMock.mockReturnValue({ setTheme: setThemeMock, theme: 'light' });
    view.rerender(<ThemePreferenceSync />);

    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('keeps an optimistic theme while the saved account value is unchanged', () => {
    useCurrentUserMock.mockReturnValue({
      currentUser: { settings: { theme: 'dark' } },
    });
    useThemeMock.mockReturnValue({ setTheme: setThemeMock, theme: 'dark' });
    const view = render(<ThemePreferenceSync />);

    useThemeMock.mockReturnValue({ setTheme: setThemeMock, theme: 'light' });
    view.rerender(<ThemePreferenceSync />);

    expect(setThemeMock).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'sepia'])(
    'ignores %s as a stored theme',
    (theme) => {
      useCurrentUserMock.mockReturnValue({
        currentUser: { settings: { theme } },
      });

      render(<ThemePreferenceSync />);

      expect(setThemeMock).not.toHaveBeenCalled();
    },
  );
});
