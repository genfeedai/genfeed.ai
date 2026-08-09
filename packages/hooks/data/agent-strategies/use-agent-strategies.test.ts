import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
const mockGetById = vi.fn();
const mockResolveAuthToken = vi.fn();

vi.mock('@genfeedai/services/automation/agent-strategies.service', () => ({
  AgentStrategiesService: {
    getInstance: vi.fn(() => ({
      getById: mockGetById,
      list: mockList,
    })),
  },
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: (...args: unknown[]) => mockResolveAuthToken(...args),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

import { useAgentStrategies } from './use-agent-strategies';
import { useAgentStrategy } from './use-agent-strategy';

const STRATEGY = { id: 'strategy-1', name: 'Strategy' };

describe('useAgentStrategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockList.mockResolvedValue([STRATEGY]);
  });

  it('lists strategies with filters', async () => {
    const { result } = renderHook(
      () => useAgentStrategies({ agentType: 'content', isActive: true }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.strategies).toEqual([STRATEGY]);
    });

    expect(mockList).toHaveBeenCalledWith({
      agentType: 'content',
      isActive: true,
    });
  });

  it('returns an empty list without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAgentStrategies(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockList).not.toHaveBeenCalled();
    expect(result.current.strategies).toEqual([]);
  });

  it('refresh refetches the list', async () => {
    const { result } = renderHook(() => useAgentStrategies(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.strategies).toEqual([STRATEGY]);
    });

    mockList.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockList).toHaveBeenCalled();
  });
});

describe('useAgentStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAuthToken.mockResolvedValue('token-abc');
    mockGetById.mockResolvedValue(STRATEGY);
  });

  it('loads a strategy by id', async () => {
    const { result } = renderHook(() => useAgentStrategy('strategy-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.strategy).toEqual(STRATEGY);
    });

    expect(mockGetById).toHaveBeenCalledWith('strategy-1');
  });

  it('stays idle without an id', () => {
    const { result } = renderHook(() => useAgentStrategy(''), {
      wrapper: createQueryWrapper(),
    });

    expect(mockGetById).not.toHaveBeenCalled();
    expect(result.current.strategy).toBeNull();
  });

  it('returns null without an auth token', async () => {
    mockResolveAuthToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAgentStrategy('strategy-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetById).not.toHaveBeenCalled();
    expect(result.current.strategy).toBeNull();
  });

  it('refresh refetches the strategy', async () => {
    const { result } = renderHook(() => useAgentStrategy('strategy-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.strategy).toEqual(STRATEGY);
    });

    mockGetById.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGetById).toHaveBeenCalled();
  });
});
