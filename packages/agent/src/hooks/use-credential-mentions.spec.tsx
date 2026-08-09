import { useCredentialMentions } from '@genfeedai/agent/hooks/use-credential-mentions';
import type {
  AgentApiService,
  CredentialMentionItem,
} from '@genfeedai/agent/services/agent-api.service';
import { renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

function makeCredential(id: string): CredentialMentionItem {
  return { id, label: `Credential ${id}` } as unknown as CredentialMentionItem;
}

function makeApi(getMentionsEffect: unknown): AgentApiService {
  return { getMentionsEffect } as unknown as AgentApiService;
}

describe('useCredentialMentions', () => {
  it('loads mentions from the api service', async () => {
    const credentials = [makeCredential('c-1')];
    const effect = vi.fn(() => Effect.succeed(credentials));

    const { result } = renderHook(() => useCredentialMentions(makeApi(effect)));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual(credentials);
  });

  it('stops loading immediately when no api service is given', async () => {
    const { result } = renderHook(() => useCredentialMentions(null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('stops loading when the service lacks the effect method', async () => {
    const { result } = renderHook(() =>
      useCredentialMentions({} as unknown as AgentApiService),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('swallows failures and leaves mentions empty', async () => {
    const effect = vi.fn(() => Effect.fail(new Error('nope')));

    const { result } = renderHook(() => useCredentialMentions(makeApi(effect)));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('aborts the in-flight request on unmount', () => {
    const effect = vi.fn(() => Effect.succeed([makeCredential('c-1')]));

    const { unmount } = renderHook(() =>
      useCredentialMentions(makeApi(effect)),
    );
    unmount();

    const signal = effect.mock.calls[0]?.[0] as AbortSignal | undefined;
    expect(signal?.aborted).toBe(true);
  });
});
