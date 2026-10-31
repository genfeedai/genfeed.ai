import { act, render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTheme = vi.hoisted(() => vi.fn());
const updateTheme = vi.hoisted(() => vi.fn());

vi.mock('~services/theme-settings.service', () => ({
  themeSettingsService: { getTheme, updateTheme },
}));

import { useAccountThemeSync } from '~hooks/use-account-theme-sync';
import { useSettingsStore } from '~store/use-settings-store';

function SyncHarness({
  authenticated = true,
}: {
  authenticated?: boolean;
}): ReactElement | null {
  useAccountThemeSync(authenticated);
  return null;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('useAccountThemeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTheme.mockResolvedValue('system');
    updateTheme.mockResolvedValue(undefined);
    useSettingsStore.setState({
      autoFill: false,
      autoPost: false,
      isLoaded: true,
      theme: 'dark',
      themeRevision: 0,
    });
  });

  it('applies the server-canonical preference after sign-in', async () => {
    getTheme.mockResolvedValue('light');

    render(<SyncHarness />);

    await waitFor(() => {
      expect(useSettingsStore.getState().theme).toBe('light');
    });
    expect(updateTheme).not.toHaveBeenCalled();
  });

  it('keeps and patches a local choice made while the server read is pending', async () => {
    const serverTheme = deferred<'light'>();
    getTheme.mockReturnValue(serverTheme.promise);

    render(<SyncHarness />);

    act(() => {
      useSettingsStore.getState().setTheme('dark');
    });
    serverTheme.resolve('light');

    await waitFor(() => {
      expect(updateTheme).toHaveBeenCalledWith('dark');
    });
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('serializes rapid PATCHes so a stale request cannot win on the server', async () => {
    const firstPatch = deferred<void>();
    updateTheme
      .mockReturnValueOnce(firstPatch.promise)
      .mockResolvedValue(undefined);

    render(<SyncHarness />);
    await waitFor(() => expect(getTheme).toHaveBeenCalledOnce());

    act(() => {
      useSettingsStore.getState().setTheme('light');
    });
    await waitFor(() => expect(updateTheme).toHaveBeenCalledWith('light'));

    act(() => {
      useSettingsStore.getState().setTheme('dark');
    });
    expect(updateTheme).toHaveBeenCalledTimes(1);

    firstPatch.resolve();

    await waitFor(() => {
      expect(updateTheme).toHaveBeenNthCalledWith(2, 'dark');
    });
  });

  it('still patches later choices when the initial account read fails', async () => {
    getTheme.mockRejectedValue(new Error('offline'));

    render(<SyncHarness />);
    await waitFor(() => expect(getTheme).toHaveBeenCalledOnce());

    act(() => {
      useSettingsStore.getState().setTheme('light');
    });

    await waitFor(() => expect(updateTheme).toHaveBeenCalledWith('light'));
  });

  it('does not let an account read overwrite a newer choice from another extension context', async () => {
    const serverTheme = deferred<'dark'>();
    getTheme.mockReturnValue(serverTheme.promise);

    render(<SyncHarness />);

    act(() => {
      useSettingsStore.getState().applyStoredSettings({
        autoFill: false,
        autoPost: false,
        theme: 'light',
      });
    });
    serverTheme.resolve('dark');

    await waitFor(() => expect(updateTheme).toHaveBeenCalledWith('light'));
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('does not contact account settings while signed out', async () => {
    render(<SyncHarness authenticated={false} />);

    await act(async () => Promise.resolve());

    expect(getTheme).not.toHaveBeenCalled();
    expect(updateTheme).not.toHaveBeenCalled();
  });
});
