import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function apiServiceStub(
  promise: ReturnType<AgentApiService['getContentMentions']>,
): AgentApiService {
  return {
    getContentMentions: vi.fn().mockReturnValue(promise),
  } as unknown as AgentApiService;
}

describe('useContentMentions', () => {
  it('exposes the fetched mentions once loading settles', async () => {
    const mentions = [
      {
        brandId: 'brand-1',
        contentTitle: 'Launch thread',
        contentType: 'text',
        id: 'post-1',
      },
    ];

    const { result } = renderHook(() =>
      useContentMentions(apiServiceStub(Promise.resolve(mentions))),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mentions).toEqual(mentions);
  });

  // Regression for the /automation/* route blank: a mentions endpoint answering
  // with a non-mentions JSON shape must leave consumers with an empty array,
  // never undefined — ContentLibraryPicker crashed on `.length` otherwise.
  it('keeps mentions as an empty array when the effect fails to decode', async () => {
    const decodeFailure = Promise.reject(
      new AgentApiDecodeError({
        cause: { data: [] },
        message: 'Failed to decode content mentions',
      }),
    );
    decodeFailure.catch(() => {});

    const { result } = renderHook(() =>
      useContentMentions(apiServiceStub(decodeFailure)),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.mentions).toEqual([]);
  });
});

it('clears old scope and aborts its request when the conversation brand changes', async () => {
  let resolveOld!: (
    value: Awaited<ReturnType<AgentApiService['getContentMentions']>>,
  ) => void;
  const pending = new Promise<
    Awaited<ReturnType<AgentApiService['getContentMentions']>>
  >((resolve) => {
    resolveOld = resolve;
  });
  const getContentMentions = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce([
      {
        brandId: 'brand-2',
        contentTitle: 'New scope',
        contentType: 'text',
        id: 'post-2',
      },
    ]);
  const api = { getContentMentions } as unknown as AgentApiService;
  const { result, rerender } = renderHook(
    ({ brandId }) => useContentMentions(api, brandId),
    {
      initialProps: { brandId: 'brand-1' },
    },
  );
  const oldSignal = getContentMentions.mock.calls[0]?.[0] as AbortSignal;
  rerender({ brandId: 'brand-2' });
  expect(oldSignal.aborted).toBe(true);
  expect(getContentMentions).toHaveBeenLastCalledWith(
    expect.any(AbortSignal),
    'brand-2',
  );
  await waitFor(() => expect(result.current.mentions[0]?.id).toBe('post-2'));
  resolveOld([
    {
      brandId: 'brand-1',
      contentTitle: 'Old scope',
      contentType: 'text',
      id: 'post-1',
    },
  ]);
  await pending;
  expect(result.current.mentions[0]?.id).toBe('post-2');
});
