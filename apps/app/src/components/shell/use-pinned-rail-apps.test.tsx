import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePinnedRailApps } from './use-pinned-rail-apps';

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
    const { result } = renderHook(usePinnedRailApps, { wrapper: StrictMode });
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
    const { result } = renderHook(usePinnedRailApps);
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
      const { result } = renderHook(usePinnedRailApps);
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
    const { result } = renderHook(usePinnedRailApps);
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
    act(() => result.current.togglePin('discovery'));
    await waitFor(() => expect(mocks.patchMeSettings).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.pinnedAppIds).toEqual(['playground']),
    );
  });

  it('does not write unknown preferences after an initial read failure', async () => {
    mocks.findMeSettings.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(usePinnedRailApps);
    await act(async () => {});
    act(() => result.current.togglePin('discovery'));
    expect(mocks.patchMeSettings).not.toHaveBeenCalled();
  });

  it('does not start a queued save after unmount', async () => {
    const pending = deferred();
    mocks.patchMeSettings.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(usePinnedRailApps);
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
});
