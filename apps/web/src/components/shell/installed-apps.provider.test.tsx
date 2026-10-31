import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InstalledAppsProvider,
  useInstalledApps,
} from './installed-apps.provider';

const mocks = vi.hoisted(() => ({
  findMyApps: vi.fn(),
  getMembers: vi.fn(),
  installApp: vi.fn(),
  organizationId: 'org-1',
  uninstallApp: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getMembers,
}));
vi.mock('@services/organization/members.service', () => ({
  MembersService: {},
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <InstalledAppsProvider>{children}</InstalledAppsProvider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.organizationId = 'org-1';
  mocks.getMembers.mockResolvedValue(mocks);
  mocks.findMyApps.mockResolvedValue(['playground']);
});

describe('InstalledAppsProvider (#5502)', () => {
  it('loads the confirmed installations for the organization', async () => {
    const { result } = renderHook(useInstalledApps, { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.installedAppIds).toEqual(['playground']);
    expect(mocks.findMyApps).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('shows an installation only after the server confirms it', async () => {
    const pending = deferred<string[]>();
    mocks.installApp.mockReturnValue(pending.promise);
    const { result } = renderHook(useInstalledApps, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let saved: Promise<boolean> | undefined;
    act(() => {
      saved = result.current.install('turbo');
    });
    await waitFor(() =>
      expect(result.current.pendingAppIds).toEqual(['turbo']),
    );
    expect(result.current.installedAppIds).toEqual(['playground']);

    await act(async () => pending.resolve(['playground', 'turbo']));
    await expect(saved).resolves.toBe(true);
    expect(result.current.installedAppIds).toEqual(['playground', 'turbo']);
    expect(result.current.pendingAppIds).toEqual([]);
  });

  it('keeps the confirmed list and reports failure when a write fails', async () => {
    mocks.uninstallApp.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useInstalledApps, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let saved: Promise<boolean> | undefined;
    act(() => {
      saved = result.current.uninstall('playground');
    });
    await expect(saved).resolves.toBe(false);
    expect(result.current.installedAppIds).toEqual(['playground']);
    await waitFor(() => expect(result.current.pendingAppIds).toEqual([]));
  });

  it('applies writes one at a time in request order', async () => {
    const first = deferred<string[]>();
    mocks.installApp
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(['playground', 'turbo', 'storyboard']);
    const { result } = renderHook(useInstalledApps, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      void result.current.install('turbo');
      void result.current.install('storyboard');
    });
    await waitFor(() => expect(mocks.installApp).toHaveBeenCalledTimes(1));
    await act(async () => first.resolve(['playground', 'turbo']));
    await waitFor(() =>
      expect(result.current.installedAppIds).toEqual([
        'playground',
        'turbo',
        'storyboard',
      ]),
    );
    expect(mocks.installApp.mock.calls).toEqual([['turbo'], ['storyboard']]);
  });

  it('reports a failed read without inventing installations', async () => {
    mocks.findMyApps.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useInstalledApps, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.installedAppIds).toEqual([]);
  });

  it('discards a previous organization response after switching', async () => {
    const stale = deferred<string[]>();
    mocks.installApp.mockReturnValue(stale.promise);
    const { result, rerender } = renderHook(useInstalledApps, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let saved: Promise<boolean> | undefined;
    act(() => {
      saved = result.current.install('turbo');
    });
    await waitFor(() => expect(mocks.installApp).toHaveBeenCalled());

    mocks.organizationId = 'org-2';
    mocks.findMyApps.mockResolvedValue(['discovery']);
    rerender();
    await waitFor(() =>
      expect(result.current.installedAppIds).toEqual(['discovery']),
    );
    await act(async () => stale.resolve(['playground', 'turbo']));
    await expect(saved).resolves.toBe(false);
    expect(result.current.installedAppIds).toEqual(['discovery']);
  });
});
