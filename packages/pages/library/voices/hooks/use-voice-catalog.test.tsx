// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockFindAllPages = vi.fn();
const mockUseAuthedService = vi.fn();
const mockLoggerError = vi.fn();

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

import { VoiceProvider } from '@genfeedai/contracts';

import { useVoiceCatalog } from './use-voice-catalog';

describe('useVoiceCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthedService.mockImplementation(
      (factory: (token: string) => unknown) => factory('token-123'),
    );
  });

  it('serves a single server page when the caller drives its own pagination', async () => {
    const voices = [{ id: 'voice-1', provider: VoiceProvider.ELEVENLABS }];
    mockFindAll.mockResolvedValue(voices);

    const { result } = renderHook(() =>
      useVoiceCatalog({
        isActive: true,
        isPaginated: true,
        limit: 12,
        page: 2,
        providers: [VoiceProvider.ELEVENLABS],
        search: 'rachel',
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFindAll).toHaveBeenCalledWith({
      isActive: true,
      limit: 12,
      page: 2,
      providers: [VoiceProvider.ELEVENLABS],
      search: 'rachel',
      status: [
        'draft',
        'uploaded',
        'processing',
        'generated',
        'failed',
        'completed',
      ],
    });
    expect(result.current.voices).toEqual(voices);
  });

  it('falls back to an empty list on fetch failure', async () => {
    mockFindAllPages.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useVoiceCatalog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.voices).toEqual([]);
    expect(result.current.error).toBe('Voices could not be loaded.');
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('clears the recoverable error after a successful retry', async () => {
    mockFindAllPages
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ id: 'voice-1' }]);

    const { result } = renderHook(() => useVoiceCatalog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Voices could not be loaded.');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.voices).toEqual([{ id: 'voice-1' }]);
  });

  it('allows manual refresh to replace previously loaded voices', async () => {
    mockFindAllPages
      .mockResolvedValueOnce([{ id: 'voice-1' }])
      .mockResolvedValueOnce([{ id: 'voice-2' }, { id: 'voice-3' }]);

    const { result } = renderHook(() =>
      useVoiceCatalog({
        status: ['completed'],
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.voices).toEqual([{ id: 'voice-1' }]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFindAllPages).toHaveBeenLastCalledWith({
      isActive: true,
      limit: undefined,
      page: undefined,
      providers: undefined,
      search: undefined,
      status: ['completed'],
    });
    expect(result.current.voices).toEqual([
      { id: 'voice-2' },
      { id: 'voice-3' },
    ]);
  });

  it('does not refetch on rerender when using default status filters', async () => {
    mockFindAllPages.mockResolvedValue([{ id: 'voice-1' }]);

    const { result, rerender } = renderHook(() => useVoiceCatalog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAllPages).toHaveBeenCalledTimes(1);

    rerender();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAllPages).toHaveBeenCalledTimes(1);
  });
});
