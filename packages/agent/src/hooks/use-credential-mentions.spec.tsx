import { useCredentialMentions } from '@genfeedai/agent/hooks/use-credential-mentions';
import type {
  AgentApiService,
  CredentialMentionItem,
} from '@genfeedai/agent/services/agent-api.service';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function makeCredential(id: string): CredentialMentionItem {
  return { id, label: `Credential ${id}` } as unknown as CredentialMentionItem;
}

function makeApi(getMentions: unknown): AgentApiService {
  return { getMentions } as unknown as AgentApiService;
}

describe('useCredentialMentions', () => {
  it('loads mentions from the api service', async () => {
    const credentials = [makeCredential('c-1')];
    const getMentions = vi.fn().mockResolvedValue(credentials);

    const { result } = renderHook(() =>
      useCredentialMentions(makeApi(getMentions)),
    );

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

  it('stops loading when the service lacks the mentions method', async () => {
    const { result } = renderHook(() =>
      useCredentialMentions({} as unknown as AgentApiService),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('swallows failures and leaves mentions empty', async () => {
    const getMentions = vi.fn().mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() =>
      useCredentialMentions(makeApi(getMentions)),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.mentions).toEqual([]);
  });

  it('aborts the in-flight request on unmount', () => {
    const getMentions = vi.fn().mockResolvedValue([makeCredential('c-1')]);

    const { unmount } = renderHook(() =>
      useCredentialMentions(makeApi(getMentions)),
    );
    unmount();

    const signal = getMentions.mock.calls[0]?.[0] as AbortSignal | undefined;
    expect(signal?.aborted).toBe(true);
  });
});
