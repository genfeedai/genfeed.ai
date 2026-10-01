const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt() {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
function publicReceipt() {
  const { actorId: _actor, requestKey: _key, ...value } = receipt();
  return {
    ...value,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: null,
  };
}

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = { get: vi.fn(), getRevision: vi.fn(), readPrompt: vi.fn() };
  return { service, getService: async () => service };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

import { useBrandedGenerationReceipt } from './use-branded-generation-receipt';

const input = {
  organizationId: 'org',
  brandId: 'brand',
  receiptId: 'receipt',
  isOpen: true,
};
function retained() {
  const value = publicReceipt();
  return {
    ...value,
    prompts: {
      ...value.prompts,
      original: {
        contentHash: hash,
        retention: 'retained' as const,
        snapshotId: 'snapshot',
      },
    },
  };
}
function prompt() {
  return {
    id: 'receipt:0:original',
    receiptId: 'receipt',
    receiptRevision: 0,
    stage: 'original',
    status: 'retained',
    text: '<script>inert</script> 🎨\r\n',
    contentHash: hash,
    reasonCode: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('historical receipt hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService = async () => mocks.service;
    mocks.service.get.mockResolvedValue(retained());
    mocks.service.getRevision.mockResolvedValue({
      ...retained(),
      receiptId: 'receipt',
      id: 'receipt:2',
      revision: 2,
    });
    mocks.service.readPrompt.mockResolvedValue(prompt());
  });
  it('loads metadata only while open and reveals only retained saved stages explicitly', async () => {
    const { result, rerender } = renderHook(
      (props) => useBrandedGenerationReceipt(props),
      { initialProps: { ...input, isOpen: false } },
    );
    expect(mocks.service.get).not.toHaveBeenCalled();
    rerender(input);
    await waitFor(() => expect(result.current.receipt).not.toBeNull());
    expect(mocks.service.readPrompt).not.toHaveBeenCalled();
    await act(() => result.current.revealPrompt('compiled'));
    expect(mocks.service.readPrompt).not.toHaveBeenCalled();
    await act(() => result.current.revealPrompt('original'));
    expect(mocks.service.readPrompt).toHaveBeenCalledExactlyOnceWith(
      'brand',
      'receipt',
      0,
      'original',
      expect.any(AbortSignal),
    );
    expect(result.current.prompts.original).toEqual(prompt());
    act(() => result.current.hidePrompt('original'));
    expect(result.current.prompts).toEqual({});
    rerender({ ...input, isOpen: false });
    expect(result.current.receipt).toBeNull();
    expect(result.current.prompts).toEqual({});
  });
  it.each(['organization', 'brand', 'receipt', 'revision', 'auth'] as const)(
    'clears plaintext synchronously on %s identity change and ignores stale metadata/finally',
    async (kind) => {
      const { result, rerender } = renderHook(
        (props) => useBrandedGenerationReceipt(props),
        {
          initialProps: { ...input, revision: undefined as number | undefined },
        },
      );
      await waitFor(() => expect(result.current.receipt).not.toBeNull());
      await act(() => result.current.revealPrompt('original'));
      const pending = deferred<ReturnType<typeof retained>>();
      mocks.service.get.mockReturnValue(pending.promise);
      mocks.service.getRevision.mockReturnValue(pending.promise);
      const next = { ...input, revision: undefined as number | undefined };
      if (kind === 'organization') next.organizationId = 'other';
      if (kind === 'brand') next.brandId = 'other';
      if (kind === 'receipt') next.receiptId = 'other';
      if (kind === 'revision') next.revision = 2;
      if (kind === 'auth') mocks.getService = async () => mocks.service;
      rerender(next);
      expect(result.current.receipt).toBeNull();
      expect(result.current.prompts).toEqual({});
      expect(result.current.isLoading).toBe(true);
      act(() => result.current.refresh());
      await act(async () => pending.resolve(retained()));
      expect(result.current.prompts).toEqual({});
    },
  );
  it('rejects out-of-order metadata and pending prompt results after scope switch', async () => {
    const old = deferred<ReturnType<typeof retained>>();
    mocks.service.get.mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(
      (props) => useBrandedGenerationReceipt(props),
      { initialProps: input },
    );
    rerender({ ...input, receiptId: 'new' });
    await waitFor(() => expect(result.current.receipt).not.toBeNull());
    const saved = result.current.receipt;
    await act(async () => old.resolve({ ...retained(), id: 'old' }));
    expect(result.current.receipt).toEqual(saved);
    const pending = deferred<ReturnType<typeof prompt>>();
    mocks.service.readPrompt.mockReturnValueOnce(pending.promise);
    let work: Promise<void> = Promise.resolve();
    act(() => {
      work = result.current.revealPrompt('original');
    });
    rerender({ ...input, isOpen: false });
    await act(async () => {
      pending.resolve(prompt());
      await work;
    });
    expect(result.current.prompts).toEqual({});
    expect(result.current.receipt).toBeNull();
  });
  it('prevents duplicate/concurrent reveal and hides an in-flight response permanently', async () => {
    const { result } = renderHook(() => useBrandedGenerationReceipt(input));
    await waitFor(() => expect(result.current.receipt).not.toBeNull());
    const pending = deferred<ReturnType<typeof prompt>>();
    mocks.service.readPrompt.mockReturnValueOnce(pending.promise);
    let work: Promise<void> = Promise.resolve();
    act(() => {
      work = result.current.revealPrompt('original');
    });
    await act(() => result.current.revealPrompt('original'));
    expect(mocks.service.readPrompt).toHaveBeenCalledTimes(1);
    act(() => result.current.hidePrompt('original'));
    await act(async () => {
      pending.resolve(prompt());
      await work;
    });
    expect(result.current.prompts).toEqual({});
    expect(result.current.loadingPrompt).toBeNull();
  });
  it('rejects retained hash mismatches, clears prompt text on refresh and cancels on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useBrandedGenerationReceipt(input),
    );
    await waitFor(() => expect(result.current.receipt).not.toBeNull());
    mocks.service.readPrompt.mockResolvedValueOnce({
      ...prompt(),
      contentHash: `sha256:${'b'.repeat(64)}`,
    });
    await act(() => result.current.revealPrompt('original'));
    expect(result.current.prompts).toEqual({});
    expect(result.current.promptError).toBe('load_failed');
    await act(() => result.current.revealPrompt('original'));
    expect(result.current.prompts.original).toBeDefined();
    act(() => result.current.refresh());
    expect(result.current.prompts).toEqual({});
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const pending = deferred<ReturnType<typeof prompt>>();
    mocks.service.readPrompt.mockReturnValueOnce(pending.promise);
    let work: Promise<void> = Promise.resolve();
    act(() => {
      work = result.current.revealPrompt('original');
    });
    await waitFor(() =>
      expect(mocks.service.readPrompt).toHaveBeenCalledTimes(3),
    );
    const signal = mocks.service.readPrompt.mock.calls[2][4];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(prompt());
      await work;
    });
  });
  it.each([
    [403, 'restricted'],
    [401, 'unavailable'],
    [404, 'unavailable'],
    [500, 'load_failed'],
  ] as const)('maps prompt HTTP%s to safe %s', async (code, error) => {
    const { result } = renderHook(() => useBrandedGenerationReceipt(input));
    await waitFor(() => expect(result.current.receipt).not.toBeNull());
    mocks.service.readPrompt.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: code },
      message: 'PRIVATE',
    });
    await act(() => result.current.revealPrompt('original'));
    expect(result.current.promptError).toBe(error);
    expect(result.current.prompts).toEqual({});
  });
  it.each([401, 403, 404, 500])(
    'maps metadata HTTP%s without exposing server messages',
    async (code) => {
      mocks.service.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: code },
        message: 'PRIVATE',
      });
      const { result } = renderHook(() => useBrandedGenerationReceipt(input));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe(
        code === 500 ? 'load_failed' : 'unavailable',
      );
      expect(result.current.receipt).toBeNull();
    },
  );
});
