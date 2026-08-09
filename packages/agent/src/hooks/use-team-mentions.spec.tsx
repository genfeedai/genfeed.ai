import { useTeamMentions } from '@genfeedai/agent/hooks/use-team-mentions';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { TeamMentionItem } from '@genfeedai/agent/types/mention.types';
import { renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

function makeMember(id: string): TeamMentionItem {
  return { id, name: `Member ${id}` } as unknown as TeamMentionItem;
}

function makeApi(getTeamMentionsEffect: unknown): AgentApiService {
  return { getTeamMentionsEffect } as unknown as AgentApiService;
}

describe('useTeamMentions', () => {
  it('loads mentions from the api service', async () => {
    const members = [makeMember('u-1'), makeMember('u-2')];
    const effect = vi.fn(() => Effect.succeed(members));

    const { result } = renderHook(() => useTeamMentions(makeApi(effect)));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual(members);
    expect(effect).toHaveBeenCalled();
  });

  it('stops loading immediately when no api service is given', async () => {
    const { result } = renderHook(() => useTeamMentions(null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('stops loading when the service lacks the effect method', async () => {
    const { result } = renderHook(() =>
      useTeamMentions({} as unknown as AgentApiService),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('swallows failures and leaves mentions empty', async () => {
    const effect = vi.fn(() => Effect.fail(new Error('nope')));

    const { result } = renderHook(() => useTeamMentions(makeApi(effect)));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('aborts the in-flight request on unmount', async () => {
    const effect = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return Effect.succeed([makeMember('u-1')]);
    });

    const { unmount } = renderHook(() => useTeamMentions(makeApi(effect)));
    unmount();

    const signal = effect.mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(true);
  });

  it('refetches when the api service identity changes', async () => {
    const firstEffect = vi.fn(() => Effect.succeed([makeMember('u-1')]));
    const secondEffect = vi.fn(() => Effect.succeed([makeMember('u-2')]));

    const { result, rerender } = renderHook(
      ({ api }: { api: AgentApiService }) => useTeamMentions(api),
      { initialProps: { api: makeApi(firstEffect) } },
    );

    await waitFor(() => {
      expect(result.current.mentions).toHaveLength(1);
    });

    rerender({ api: makeApi(secondEffect) });

    await waitFor(() => {
      expect(result.current.mentions[0]?.id).toBe('u-2');
    });
  });
});
