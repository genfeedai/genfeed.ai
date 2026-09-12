import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeStudioHandoff: vi.fn(),
  notificationsInfo: vi.fn(),
  searchParamsString: 'handoff=handoff-1',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.searchParamsString),
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentApiService: () => ({
    consumeStudioHandoff: mocks.consumeStudioHandoff,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ info: mocks.notificationsInfo }),
  },
}));

import { useStudioGenerateHandoff } from './useStudioGenerateHandoff';

const payload: AgentStudioHandoffPayload = {
  aspectRatio: '1:1',
  brandId: 'brand-1',
  modelKey: 'provider/model-x',
  outputs: 2,
  prompt: 'A futuristic city at sunset',
  type: 'image',
};

describe('useStudioGenerateHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParamsString = 'handoff=handoff-1';
  });

  it('consumes the handoff id from the URL and returns its payload', async () => {
    mocks.consumeStudioHandoff.mockResolvedValue(payload);

    const { result } = renderHook(() => useStudioGenerateHandoff());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toEqual(payload);
    expect(mocks.consumeStudioHandoff).toHaveBeenCalledWith(
      'handoff-1',
      expect.anything(),
    );
    expect(mocks.notificationsInfo).not.toHaveBeenCalled();
  });

  it('falls back to null with a notice for an expired or foreign handoff', async () => {
    mocks.consumeStudioHandoff.mockResolvedValue(null);

    const { result } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toBeNull();
    expect(mocks.notificationsInfo).toHaveBeenCalledTimes(1);
  });

  it('falls back to null with a notice when the request itself fails', async () => {
    mocks.consumeStudioHandoff.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.payload).toBeNull();
    expect(mocks.notificationsInfo).toHaveBeenCalledTimes(1);
  });

  it('never calls the service when the URL has no handoff id', async () => {
    mocks.searchParamsString = '';

    const { result } = renderHook(() => useStudioGenerateHandoff());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.payload).toBeNull();
    expect(mocks.consumeStudioHandoff).not.toHaveBeenCalled();
  });

  it('consumes the same id only once even if the hook re-renders', async () => {
    mocks.consumeStudioHandoff.mockResolvedValue(payload);

    const { rerender } = renderHook(() => useStudioGenerateHandoff());
    await waitFor(() =>
      expect(mocks.consumeStudioHandoff).toHaveBeenCalledTimes(1),
    );

    rerender();
    rerender();

    expect(mocks.consumeStudioHandoff).toHaveBeenCalledTimes(1);
  });
});
