import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeyGenCatalog } from './use-heygen-catalog';

const mocks = vi.hoisted(() => ({
  organizationId: 'org-a' as string | undefined,
  getService: vi.fn(),
  avatars: vi.fn(),
  voices: vi.fn(),
  page: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: { getInstance: vi.fn() },
}));
const voice: HeyGenCatalogVoice = {
  voiceId: 'personal',
  name: 'Personal',
  preview: '',
  index: 0,
  ownership: 'private',
  connection: { provider: 'heygen', kind: 'byok', organizationId: 'org-a' },
};

describe('HeyGen catalogue recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organizationId = 'org-a';
    mocks.avatars.mockResolvedValue([]);
    mocks.voices.mockResolvedValue([voice]);
    mocks.page.mockImplementation(
      async (options: {
        ownership: string;
        cursor?: string;
        signal?: AbortSignal;
      }) => ({
        avatars:
          options.ownership === 'public' ? await mocks.avatars(options) : [],
        ownership: options.ownership,
        nextCursor: null,
      }),
    );
    mocks.getService.mockResolvedValue({
      fetchAvatarPage: mocks.page,
      fetchVoices: mocks.voices,
    });
  });
  it('keeps voices when avatars fail and retries the failed catalogue explicitly', async () => {
    mocks.avatars.mockRejectedValueOnce(new Error('avatar outage'));
    const { result } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.voices).toEqual([voice]);
    expect(result.current.error).toContain('avatars');
    expect(result.current.avatars).toEqual([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mocks.avatars).toHaveBeenCalledTimes(2);
    expect(result.current.voices).toEqual([voice]);
  });
  it('keeps an independent healthy avatar catalogue when voices fail', async () => {
    const avatar: HeyGenCatalogAvatar = {
      avatarId: 'look',
      name: 'Look',
      preview: '',
      index: 0,
      avatarRef: {
        version: 1,
        source: 'heygen-look',
        provider: 'heygen',
        lookId: 'look',
        groupId: null,
        ownership: 'public',
        label: 'Look',
        preview: null,
        avatarType: null,
        supportedEngines: [],
        readiness: {
          lookStatus: 'ready',
          groupStatus: null,
          consentStatus: null,
          usable: true,
          reason: null,
        },
        connection: {
          provider: 'heygen',
          kind: 'platform',
          organizationId: 'org-a',
        },
      },
    };
    mocks.avatars.mockResolvedValue([avatar]);
    mocks.voices.mockRejectedValue(new Error('voice outage'));
    const { result } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.avatars).toEqual([avatar]);
    expect(result.current.voices).toEqual([]);
    expect(result.current.error).toContain('voices');
  });
  it('clears the old private catalogue immediately and ignores its aborted response after an organization switch', async () => {
    let resolveOld: ((value: HeyGenCatalogVoice[]) => void) | undefined;
    mocks.voices
      .mockReturnValueOnce(
        new Promise<HeyGenCatalogVoice[]>((resolve) => {
          resolveOld = resolve;
        }),
      )
      .mockResolvedValueOnce([]);
    const { result, rerender } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(mocks.voices).toHaveBeenCalledOnce());
    const oldSignal = mocks.voices.mock.calls[0][0] as AbortSignal;
    mocks.organizationId = 'org-b';
    rerender();
    expect(result.current.voices).toEqual([]);
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => resolveOld?.([voice]));
    expect(result.current.voices).toEqual([]);
    expect(result.current.error).toBeNull();
  });
  it('hides an already loaded private identity while the next organization is still loading', async () => {
    const { result, rerender } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.voices).toEqual([voice]));
    mocks.voices.mockReturnValueOnce(new Promise(() => {}));
    mocks.organizationId = 'org-b';
    rerender();
    expect(result.current.voices).toEqual([]);
    await waitFor(() => expect(mocks.voices).toHaveBeenCalledTimes(2));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.voices).toEqual([]);
  });
  it('does not fetch without an organization and aborts pending requests on unmount', async () => {
    mocks.organizationId = undefined;
    const empty = renderHook(() => useHeyGenCatalog());
    expect(mocks.getService).not.toHaveBeenCalled();
    empty.unmount();
    mocks.organizationId = 'org-a';
    mocks.voices.mockReturnValue(new Promise(() => {}));
    const pending = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(mocks.voices).toHaveBeenCalledOnce());
    const signal = mocks.voices.mock.calls[0][0] as AbortSignal;
    pending.unmount();
    expect(signal.aborted).toBe(true);
  });
  it('publishes a first page without waiting for voices and does not exhaust the catalogue', async () => {
    mocks.voices.mockReturnValue(new Promise(() => {}));
    mocks.page.mockImplementation(async ({ ownership }) => ({
      avatars: [],
      ownership,
      nextCursor: ownership === 'public' ? 'next' : null,
    }));
    const { result } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.hasMoreAvatars).toBe(true));
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(true);
  });

  it('follows an explicit cursor once and retains loaded choices on a continuation outage', async () => {
    mocks.page.mockImplementation(async ({ ownership, cursor }) => {
      if (cursor) throw new Error('continuation outage');
      return {
        avatars: [],
        ownership,
        nextCursor: ownership === 'public' ? 'next' : null,
      };
    });
    const { result } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.page).toHaveBeenCalledTimes(2);
    await act(async () => result.current.loadMoreAvatars());
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownership: 'public', cursor: 'next' }),
    );
    expect(result.current.voices).toEqual([voice]);
    expect(result.current.hasMoreAvatars).toBe(true);
    expect(result.current.error).toContain('More HeyGen avatars');
  });

  it('ignores a pending continuation from the previous organization', async () => {
    let resolvePage:
      | ((value: {
          avatars: HeyGenCatalogAvatar[];
          ownership: 'public';
          nextCursor: null;
        }) => void)
      | undefined;
    mocks.page.mockImplementation(async ({ ownership, cursor }) => {
      if (cursor)
        return new Promise((resolve) => {
          resolvePage = resolve;
        });
      return {
        avatars: [],
        ownership,
        nextCursor: ownership === 'public' ? 'next' : null,
      };
    });
    const { result, rerender } = renderHook(() => useHeyGenCatalog());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.loadMoreAvatars();
    });
    await waitFor(() => expect(resolvePage).toBeDefined());
    const signal = mocks.page.mock.calls.at(-1)?.[0].signal as AbortSignal;
    mocks.organizationId = 'org-b';
    rerender();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolvePage?.({ avatars: [], ownership: 'public', nextCursor: null });
      await pending;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMoreAvatars).toBe(true);
    expect(result.current.voices).toEqual([voice]);
  });
});
