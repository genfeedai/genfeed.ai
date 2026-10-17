import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRailPreferences } from './use-rail-preferences';

const mocks = vi.hoisted(() => ({
  findMeSettings: vi.fn(),
  getUsers: vi.fn(),
  patchMeSettings: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getUsers,
}));
vi.mock('@services/organization/users.service', () => ({ UsersService: {} }));

function deferred() {
  let resolve!: (value: { pinnedAppIds: string[] }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ pinnedAppIds: string[] }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUsers.mockResolvedValue(mocks);
  mocks.findMeSettings.mockResolvedValue({ pinnedAppIds: ['playground'] });
  mocks.patchMeSettings.mockImplementation(async (settings) => settings);
});

describe('rail pin persistence', () => {
  it('performs one write for one toggle under StrictMode', async () => {
    const { result } = renderHook(useRailPreferences, { wrapper: StrictMode });
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
    act(() => result.current.togglePin('discovery'));
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1));
    expect(result.current.pinnedAppIds).toEqual(['playground', 'discovery']);
  });

  it('rebases edits made during the initial read onto saved preferences', async () => {
    const initial = deferred();
    mocks.findMeSettings.mockReturnValue(initial.promise);
    const { result } = renderHook(useRailPreferences);
    act(() => result.current.togglePin('discovery'));
    expect(mocks.patchMeSettings).not.toHaveBeenCalled();
    await act(async () => initial.resolve({ pinnedAppIds: ['playground'] }));
    await waitFor(() =>
      expect(mocks.patchMeSettings).toHaveBeenCalledWith({
        pinnedAppIds: ['playground', 'discovery'],
      }),
    );
    expect(result.current.pinnedAppIds).toEqual(['playground', 'discovery']);
  });

  it.each(['success', 'failure'])(
    'serializes saves and retains a newer edit after earlier %s',
    async (outcome) => {
      const first = deferred();
      const second = deferred();
      mocks.patchMeSettings
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const { result } = renderHook(useRailPreferences);
      await waitFor(() =>
        expect(result.current.pinnedAppIds).toEqual(['playground']),
      );
      act(() => result.current.togglePin('discovery'));
      await waitFor(() =>
        expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1),
      );
      act(() => result.current.togglePin('messages'));
      expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (outcome === 'success')
          first.resolve({ pinnedAppIds: ['playground', 'discovery'] });
        else first.reject(new Error('offline'));
      });
      expect(result.current.pinnedAppIds).toEqual([
        'playground',
        'discovery',
        'messages',
      ]);
      await waitFor(() =>
        expect(mocks.patchMeSettings).toHaveBeenCalledTimes(2),
      );
      expect(mocks.patchMeSettings.mock.calls[1][0]).toEqual({
        pinnedAppIds: ['playground', 'discovery', 'messages'],
      });
      await act(async () =>
        second.resolve({
          pinnedAppIds: ['playground', 'discovery', 'messages'],
        }),
      );
      expect(result.current.pinnedAppIds).toEqual([
        'playground',
        'discovery',
        'messages',
      ]);
    },
  );

  it('rolls back a final failed save to the last confirmed list', async () => {
    mocks.patchMeSettings.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(useRailPreferences);
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
    act(() => result.current.togglePin('discovery'));
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
  });

  it('keeps a failed rail order, reports the failure and resends it on the next change', async () => {
    const onSaveError = vi.fn();
    mocks.patchMeSettings.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useRailPreferences({ onSaveError }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => result.current.setRailAppOrder(['analytics', 'agent']));
    await waitFor(() =>
      expect(onSaveError).toHaveBeenCalledWith('railAppOrder'),
    );
    expect(result.current.railAppOrder).toEqual(['analytics', 'agent']);
    act(() =>
      result.current.setRailAppOrder(['analytics', 'agent', 'library']),
    );
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(2));
    expect(mocks.patchMeSettings.mock.calls[1][0]).toEqual({
      railAppOrder: ['analytics', 'agent', 'library'],
    });
  });

  it('reports a failed pin save too', async () => {
    const onSaveError = vi.fn();
    mocks.patchMeSettings.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useRailPreferences({ onSaveError }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => result.current.togglePin('discovery'));
    await waitFor(() =>
      expect(onSaveError).toHaveBeenCalledWith('pinnedAppIds'),
    );
  });

  it('does not write unknown preferences after an initial read failure', async () => {
    mocks.findMeSettings.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(useRailPreferences);
    await act(async () => {});
    act(() => result.current.togglePin('discovery'));
    expect(mocks.patchMeSettings).not.toHaveBeenCalled();
  });

  it('does not start a queued save after unmount', async () => {
    const pending = deferred();
    mocks.patchMeSettings.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(useRailPreferences);
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
    act(() => result.current.togglePin('discovery'));
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1));
    act(() => result.current.togglePin('messages'));
    unmount();
    await act(async () =>
      pending.resolve({ pinnedAppIds: ['playground', 'discovery'] }),
    );
    expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1);
  });

  it('saves a rail order with one read, dropping unknown and duplicate ids', async () => {
    mocks.findMeSettings.mockResolvedValue({
      pinnedAppIds: ['playground'],
      railAppOrder: ['agent'],
    });
    const { result } = renderHook(useRailPreferences);
    await waitFor(() => expect(result.current.railAppOrder).toEqual(['agent']));
    act(() =>
      result.current.setRailAppOrder([
        'library',
        'studio',
        'agent',
        'library',
        'playground',
      ]),
    );
    expect(result.current.railAppOrder).toEqual([
      'library',
      'agent',
      'playground',
    ]);
    await waitFor(() =>
      expect(mocks.patchMeSettings).toHaveBeenCalledWith({
        railAppOrder: ['library', 'agent', 'playground'],
      }),
    );
    expect(mocks.findMeSettings).toHaveBeenCalledTimes(1);
  });

  it('writes pins and order as separate patches, one at a time', async () => {
    const first = deferred();
    mocks.patchMeSettings
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (settings) => settings);
    const { result } = renderHook(useRailPreferences);
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
    act(() => result.current.togglePin('discovery'));
    act(() => result.current.setRailAppOrder(['analytics', 'workspace']));
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1));
    expect(mocks.patchMeSettings).toHaveBeenLastCalledWith({
      pinnedAppIds: ['playground', 'discovery'],
    });
    await act(async () =>
      first.resolve({ pinnedAppIds: ['playground', 'discovery'] }),
    );
    await waitFor(() =>
      expect(mocks.patchMeSettings).toHaveBeenLastCalledWith({
        railAppOrder: ['analytics', 'workspace'],
      }),
    );
    expect(result.current.pinnedAppIds).toEqual(['playground', 'discovery']);
    expect(result.current.railAppOrder).toEqual(['analytics', 'workspace']);
  });

  it('reports loaded after the read, including a failed one', async () => {
    const { result } = renderHook(useRailPreferences);
    expect(result.current.isLoaded).toBe(false);
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    mocks.findMeSettings.mockRejectedValueOnce(new Error('offline'));
    const failed = renderHook(useRailPreferences);
    await waitFor(() => expect(failed.result.current.isLoaded).toBe(true));
    expect(failed.result.current.homeAppId).toBeNull();
  });

  it('saves the home app and clears it with null', async () => {
    mocks.findMeSettings.mockResolvedValue({
      homeAppId: 'agent',
      pinnedAppIds: [],
    });
    const { result } = renderHook(useRailPreferences);
    await waitFor(() => expect(result.current.homeAppId).toBe('agent'));

    act(() => result.current.setHomeAppId('library'));
    expect(result.current.homeAppId).toBe('library');
    await waitFor(() =>
      expect(mocks.patchMeSettings).toHaveBeenLastCalledWith({
        homeAppId: 'library',
      }),
    );

    act(() => result.current.setHomeAppId(null));
    await waitFor(() =>
      expect(mocks.patchMeSettings).toHaveBeenLastCalledWith({
        homeAppId: null,
      }),
    );
    expect(result.current.homeAppId).toBeNull();
  });

  it('ignores a saved home app the catalog does not know', async () => {
    mocks.findMeSettings.mockResolvedValue({ homeAppId: 'studio' });
    const { result } = renderHook(useRailPreferences);
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.homeAppId).toBeNull();
  });
});
