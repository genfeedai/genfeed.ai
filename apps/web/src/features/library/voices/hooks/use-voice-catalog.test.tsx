// @vitest-environment jsdom

import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockFindAllPages = vi.fn();
const mockUseAuthedService = vi.fn();
const mockLoggerError = vi.fn();

const voicesService = {
  findAll: mockFindAll,
  findAllPages: mockFindAllPages,
};
const resolveVoicesService = async () => voicesService;

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (...args: unknown[]) => mockUseAuthedService(...args),
}));

vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: vi.fn(() => ({
      findAll: mockFindAll,
      findAllPages: mockFindAllPages,
    })),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

import { IngredientStatus, VoiceProvider } from '@genfeedai/contracts';

import { useVoiceCatalog } from './use-voice-catalog';

describe('useVoiceCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthedService.mockImplementation(() => resolveVoicesService);
  });

  it('serves a single server page when the caller drives its own pagination', async () => {
    const voices = [{ id: 'voice-1', provider: VoiceProvider.ELEVENLABS }];
    mockFindAll.mockResolvedValue(voices);

    const { result } = renderHook(
      () =>
        useVoiceCatalog({
          isActive: true,
          isPaginated: true,
          limit: 12,
          page: 2,
          providers: [VoiceProvider.ELEVENLABS],
          search: 'rachel',
        }),
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFindAll).toHaveBeenCalledWith(
      {
        isActive: true,
        limit: 12,
        page: 2,
        providers: [VoiceProvider.ELEVENLABS],
        search: 'rachel',
        status: [
          IngredientStatus.DRAFT,
          IngredientStatus.UPLOADED,
          IngredientStatus.PROCESSING,
          IngredientStatus.GENERATED,
          IngredientStatus.FAILED,
          'completed',
        ],
      },
      expect.any(AbortSignal),
    );
    expect(result.current.voices).toEqual(voices);
  });

  it('is loading, with no voices, on the first render of a first visit', () => {
    mockFindAllPages.mockReturnValue(new Promise(() => {}));
    const firstRender: { isLoading: boolean; voiceCount: number }[] = [];

    renderHook(
      () => {
        const state = useVoiceCatalog();
        firstRender.push({
          isLoading: state.isLoading,
          voiceCount: state.voices.length,
        });
        return state;
      },
      { wrapper: queryClientWrapper() },
    );

    expect(firstRender[0]).toEqual({ isLoading: true, voiceCount: 0 });
  });

  it('paints the cached voices on a return visit without a loading state', async () => {
    mockFindAllPages.mockResolvedValue([{ id: 'voice-1' }]);
    const client = createTestQueryClient();
    const first = renderHook(() => useVoiceCatalog(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const firstRender: { isLoading: boolean; voices: unknown[] }[] = [];
    renderHook(
      () => {
        const state = useVoiceCatalog();
        firstRender.push({ isLoading: state.isLoading, voices: state.voices });
        return state;
      },
      { wrapper: queryClientWrapper(client) },
    );

    expect(firstRender[0]).toEqual({
      isLoading: false,
      voices: [{ id: 'voice-1' }],
    });
  });

  it('falls back to an empty list on fetch failure', async () => {
    mockFindAllPages.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useVoiceCatalog(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.voices).toEqual([]);
    expect(result.current.error).toBe('Voices could not be loaded.');
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('clears the recoverable error after a successful retry', async () => {
    mockFindAllPages
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'voice-1' }]);

    const { result } = renderHook(() => useVoiceCatalog(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Voices could not be loaded.');

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.voices).toEqual([{ id: 'voice-1' }]);
  });

  it('allows manual refresh to replace previously loaded voices', async () => {
    mockFindAllPages
      .mockResolvedValueOnce([{ id: 'voice-1' }])
      .mockResolvedValueOnce([{ id: 'voice-2' }, { id: 'voice-3' }]);

    const { result } = renderHook(
      () =>
        useVoiceCatalog({
          status: ['completed'],
        }),
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.voices).toEqual([{ id: 'voice-1' }]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFindAllPages).toHaveBeenLastCalledWith(
      {
        isActive: true,
        limit: undefined,
        page: undefined,
        providers: undefined,
        search: undefined,
        status: ['completed'],
      },
      expect.any(AbortSignal),
    );
    await waitFor(() =>
      expect(result.current.voices).toEqual([
        { id: 'voice-2' },
        { id: 'voice-3' },
      ]),
    );
  });

  it('does not refetch on rerender when using default status filters', async () => {
    mockFindAllPages.mockResolvedValue([{ id: 'voice-1' }]);

    const { result, rerender } = renderHook(() => useVoiceCatalog(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAllPages).toHaveBeenCalledTimes(1);

    rerender();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAllPages).toHaveBeenCalledTimes(1);
  });
});
