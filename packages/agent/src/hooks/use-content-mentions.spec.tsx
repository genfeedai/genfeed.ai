import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

function apiServiceStub(
  effect: ReturnType<AgentApiService['getContentMentionsEffect']>,
): AgentApiService {
  return {
    getContentMentionsEffect: vi.fn().mockReturnValue(effect),
  } as unknown as AgentApiService;
}

describe('useContentMentions', () => {
  it('exposes the fetched mentions once loading settles', async () => {
    const mentions = [
      { contentTitle: 'Launch thread', contentType: 'text', id: 'post-1' },
    ];

    const { result } = renderHook(() =>
      useContentMentions(apiServiceStub(Effect.succeed(mentions))),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mentions).toEqual(mentions);
  });

  // Regression for the /automation/* route blank: a mentions endpoint answering
  // with a non-mentions JSON shape must leave consumers with an empty array,
  // never undefined — ContentLibraryPicker crashed on `.length` otherwise.
  it('keeps mentions as an empty array when the effect fails to decode', async () => {
    const decodeFailure = Effect.fail(
      new AgentApiDecodeError({
        cause: { data: [] },
        message: 'Failed to decode content mentions',
      }),
    );

    const { result } = renderHook(() =>
      useContentMentions(apiServiceStub(decodeFailure)),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mentions).toEqual([]);
  });
});
