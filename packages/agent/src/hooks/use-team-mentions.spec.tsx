import { useTeamMentions } from '@genfeedai/agent/hooks/use-team-mentions';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TeamMentionItem } from '@genfeedai/agent/types/mention.types';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeMember(id: string): TeamMentionItem {
  return { id, name: `Member ${id}` } as unknown as TeamMentionItem;
}

function makeApi(getTeamMentions: unknown): AgentApiService {
  return { getTeamMentions } as unknown as AgentApiService;
}

describe('useTeamMentions', () => {
  it('loads mentions from the api service', async () => {
    const members = [makeMember('u-1'), makeMember('u-2')];
    const getTeamMentions = vi.fn().mockResolvedValue(members);

    const { result } = renderHook(() =>
      useTeamMentions(makeApi(getTeamMentions)),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual(members);
    expect(getTeamMentions).toHaveBeenCalled();
  });

  it('stops loading immediately when no api service is given', async () => {
    const { result } = renderHook(() => useTeamMentions(null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('stops loading when the service lacks the mentions method', async () => {
    const { result } = renderHook(() =>
      useTeamMentions({} as unknown as AgentApiService),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('swallows failures and leaves mentions empty', async () => {
    const getTeamMentions = vi.fn().mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() =>
      useTeamMentions(makeApi(getTeamMentions)),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('aborts the in-flight request on unmount', async () => {
    const getTeamMentions = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return Promise.resolve([makeMember('u-1')]);
    });

    const { unmount } = renderHook(() =>
      useTeamMentions(makeApi(getTeamMentions)),
    );
    unmount();

    const signal = getTeamMentions.mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(true);
  });

  it('refetches when the api service identity changes', async () => {
    const firstGetTeamMentions = vi.fn().mockResolvedValue([makeMember('u-1')]);
    const secondGetTeamMentions = vi
      .fn()
      .mockResolvedValue([makeMember('u-2')]);

    const { result, rerender } = renderHook(
      ({ api }: { api: AgentApiService }) => useTeamMentions(api),
      { initialProps: { api: makeApi(firstGetTeamMentions) } },
    );

    await waitFor(() => {
      expect(result.current.mentions).toHaveLength(1);
    });

    rerender({ api: makeApi(secondGetTeamMentions) });

    await waitFor(() => {
      expect(result.current.mentions[0]?.id).toBe('u-2');
    });
  });
});
