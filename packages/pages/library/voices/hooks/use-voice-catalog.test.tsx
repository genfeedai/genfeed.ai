// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockUseAuthedService = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (...args: unknown[]) => mockUseAuthedService(...args),
}));

vi.mock('@services/ingredients/voices.service', () => ({
  VoicesService: {
    getInstance: vi.fn(() => ({
      findAll: mockFindAll,
    })),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
}));

import { VoiceProvider } from '@genfeedai/enums';

import { useVoiceCatalog } from './use-voice-catalog';

describe('useVoiceCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthedService.mockImplementation(
      (factory: (token: string) => unknown) => factory('token-123'),
    );
  });

  it('fetches voices from the db-backed voices service with query options', async () => {
    const voices = [{ id: 'voice-1', provider: VoiceProvider.ELEVENLABS }];
    mockFindAll.mockResolvedValue(voices);

    const { result } = renderHook(() =>
      useVoiceCatalog({
        isActive: true,
        limit: 12,
        page: 2,
        pagination: true,
        providers: [VoiceProvider.ELEVENLABS],
        search: 'rachel',
        voiceSource: ['catalog'],
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFindAll).toHaveBeenCalledWith({
      isActive: true,
      limit: 12,
      page: 2,
      pagination: true,
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
      voiceSource: ['catalog'],
    });
    expect(result.current.voices).toEqual(voices);
  });

  it('falls back to an empty list on fetch failure', async () => {
    mockFindAll.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useVoiceCatalog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.voices).toEqual([]);
    expect(mockLoggerError).toHaveBeenCalled();
  });

  it('allows manual refresh to replace previously loaded voices', async () => {
    mockFindAll
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

    expect(mockFindAll).toHaveBeenLastCalledWith({
      isActive: true,
      limit: undefined,
      page: undefined,
      pagination: false,
      providers: undefined,
      search: undefined,
      status: ['completed'],
      voiceSource: undefined,
    });
    expect(result.current.voices).toEqual([
      { id: 'voice-2' },
      { id: 'voice-3' },
    ]);
  });

  it('does not refetch on rerender when using default status filters', async () => {
    mockFindAll.mockResolvedValue([{ id: 'voice-1' }]);

    const { result, rerender } = renderHook(() => useVoiceCatalog());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAll).toHaveBeenCalledTimes(1);

    rerender();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFindAll).toHaveBeenCalledTimes(1);
  });
});
