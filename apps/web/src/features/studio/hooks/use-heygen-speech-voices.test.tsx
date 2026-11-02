import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { HeyGenSpeechVoice } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeyGenSpeechVoices } from './use-heygen-speech-voices';

const mocks = vi.hoisted(() => ({
  fetchSpeechVoices: vi.fn(),
  getService: vi.fn(),
  organizationId: 'org-a' as string | undefined,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.organizationId }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: { getInstance: vi.fn() },
}));

const voice: HeyGenSpeechVoice = {
  language: 'en',
  mode: 'instant',
  name: 'Founder clone',
  ownership: 'private',
  voiceId: 'clone-1',
};

describe('useHeyGenSpeechVoices', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.organizationId = 'org-a';
    mocks.fetchSpeechVoices.mockResolvedValue({
      hasPersonalConnection: true,
      voices: [voice],
    });
    mocks.getService.mockResolvedValue({
      fetchSpeechVoices: mocks.fetchSpeechVoices,
    });
  });

  it('loads the speech voices and the personal-connection flag', async () => {
    const { result } = renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.voices).toEqual([voice]);
    expect(result.current.hasPersonalConnection).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('is loading, not loaded, on the first render of a first visit', () => {
    const firstRender: { isLoaded: boolean; isLoading: boolean }[] = [];

    renderHook(
      () => {
        const state = useHeyGenSpeechVoices();
        firstRender.push({
          isLoaded: state.isLoaded,
          isLoading: state.isLoading,
        });
        return state;
      },
      { wrapper: queryClientWrapper() },
    );

    expect(firstRender[0]).toEqual({ isLoaded: false, isLoading: true });
  });

  it('paints the cached voices on a return visit without a loading state', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(first.result.current.isLoaded).toBe(true));
    first.unmount();

    const firstRender: {
      isLoading: boolean;
      voices: readonly HeyGenSpeechVoice[];
    }[] = [];
    renderHook(
      () => {
        const state = useHeyGenSpeechVoices();
        firstRender.push({ isLoading: state.isLoading, voices: state.voices });
        return state;
      },
      { wrapper: queryClientWrapper(client) },
    );

    expect(firstRender[0]).toEqual({ isLoading: false, voices: [voice] });
  });

  it('does not fetch while disabled', () => {
    const { result } = renderHook(
      () => useHeyGenSpeechVoices({ isEnabled: false }),
      { wrapper: queryClientWrapper() },
    );

    expect(mocks.getService).not.toHaveBeenCalled();
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.voices).toEqual([]);
  });

  it('does not fetch without an organization', () => {
    mocks.organizationId = undefined;
    renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(),
    });

    expect(mocks.getService).not.toHaveBeenCalled();
  });

  it('degrades to an empty, not-loaded catalog on failure and recovers on retry', async () => {
    mocks.fetchSpeechVoices.mockRejectedValueOnce(new Error('outage'));
    const { result } = renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.error).toContain('HeyGen Voice'));
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.voices).toEqual([]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.voices).toEqual([voice]);
  });

  it('hides the previous organization catalog while the next one loads', async () => {
    const { result, rerender } = renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    mocks.fetchSpeechVoices.mockReturnValueOnce(new Promise(() => {}));
    mocks.organizationId = 'org-b';
    rerender();

    expect(result.current.voices).toEqual([]);
    expect(result.current.isLoaded).toBe(false);
    await waitFor(() =>
      expect(mocks.fetchSpeechVoices).toHaveBeenCalledTimes(2),
    );
  });

  it('aborts a pending request on unmount', async () => {
    mocks.fetchSpeechVoices.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useHeyGenSpeechVoices(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(mocks.fetchSpeechVoices).toHaveBeenCalledOnce());
    const signal = mocks.fetchSpeechVoices.mock.calls[0][0] as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
