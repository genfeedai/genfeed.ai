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

import type { IHttpError } from '@genfeedai/contracts/interfaces/utils/error.interface';
import type {
  IHttpInterceptorError,
  IHttpSanitizedError,
} from '@genfeedai/contracts/interfaces/utils/http-interceptor-error.interface';
import { act, renderHook, waitFor } from '@testing-library/react';
import { isAxiosError } from 'axios';
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
function authError(): IHttpInterceptorError {
  return Object.assign(new Error('PRIVATE'), { isAuthError: true });
}
function sanitizedError(status: number): Error & IHttpSanitizedError {
  return Object.assign(new Error('PRIVATE'), { status, statusText: 'PRIVATE' });
}
function httpError(statusCode: number): IHttpError {
  return { statusCode, message: 'PRIVATE' };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('historical receipt hook', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('axios')>('axios');
    vi.mocked(isAxiosError).mockImplementation(actual.isAxiosError);
    mocks.service.get.mockReset();
    mocks.service.getRevision.mockReset();
    mocks.service.readPrompt.mockReset();
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
      const value = {
        ...retained(),
        organizationId: next.organizationId,
        brandId: next.brandId,
        id:
          next.revision === undefined ? next.receiptId : `${next.receiptId}:2`,
        ...(next.revision === undefined
          ? {}
          : { receiptId: next.receiptId, revision: 2 }),
      };
      await act(async () => pending.resolve(value));
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
    await waitFor(() =>
      expect(mocks.service.get).toHaveBeenCalledWith(
        'brand',
        'receipt',
        expect.any(AbortSignal),
      ),
    );
    const oldSignal = mocks.service.get.mock.calls[0][2];
    mocks.service.get.mockResolvedValueOnce({ ...retained(), id: 'new' });
    rerender({ ...input, receiptId: 'new' });
    await waitFor(() => expect(result.current.receipt?.id).toBe('new'));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => old.resolve(retained()));
    expect(result.current.receipt?.id).toBe('new');
    expect(result.current.isLoading).toBe(false);
    const pending = deferred<ReturnType<typeof prompt>>();
    mocks.service.readPrompt.mockReturnValueOnce(pending.promise);
    let work: Promise<void> = Promise.resolve();
    act(() => {
      work = result.current.revealPrompt('original');
    });
    await waitFor(() =>
      expect(mocks.service.readPrompt).toHaveBeenCalledWith(
        'brand',
        'new',
        0,
        'original',
        expect.any(AbortSignal),
      ),
    );
    const promptSignal = mocks.service.readPrompt.mock.calls[0][4];
    rerender({ ...input, receiptId: 'new', isOpen: false });
    expect(promptSignal.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ ...prompt(), id: 'new:0:original', receiptId: 'new' });
      await work;
    });
    expect(result.current.prompts).toEqual({});
    expect(result.current.receipt).toBeNull();
  });
  it('ignores old finally while the new metadata request remains pending', async () => {
    const old = deferred<ReturnType<typeof retained>>();
    const next = deferred<ReturnType<typeof retained>>();
    mocks.service.get
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(
      (props) => useBrandedGenerationReceipt(props),
      { initialProps: input },
    );
    await waitFor(() => expect(mocks.service.get).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.service.get.mock.calls[0][2];
    rerender({ ...input, receiptId: 'new' });
    await waitFor(() =>
      expect(mocks.service.get).toHaveBeenCalledWith(
        'brand',
        'new',
        expect.any(AbortSignal),
      ),
    );
    await act(async () => old.resolve(retained()));
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.receipt).toBeNull();
    await act(async () => next.resolve({ ...retained(), id: 'new' }));
    expect(result.current.receipt?.id).toBe('new');
    expect(result.current.isLoading).toBe(false);
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
  const transformedErrors = [
    ['auth Error', authError(), 'unavailable', 'unavailable'],
    ...[403, 404, 500].map(
      (code) =>
        [
          `sanitized ${code}`,
          sanitizedError(code),
          code === 500 ? 'load_failed' : 'unavailable',
          code === 403
            ? 'restricted'
            : code === 404
              ? 'unavailable'
              : 'load_failed',
        ] as const,
    ),
    ...[403, 404, 500].map(
      (code) =>
        [
          `JSON API ${code}`,
          {
            errors: [
              {
                status: String(code),
                code: 'receipt_access_denied',
                detail: 'PRIVATE',
              },
            ],
          },
          code === 500 ? 'load_failed' : 'unavailable',
          code === 403
            ? 'restricted'
            : code === 404
              ? 'unavailable'
              : 'load_failed',
        ] as const,
    ),
    ...[401, 403, 404].map(
      (code) =>
        [
          `statusCode ${code}`,
          httpError(code),
          'unavailable',
          code === 403 ? 'restricted' : 'unavailable',
        ] as const,
    ),
    ['unknown Error', new Error('PRIVATE'), 'load_failed', 'load_failed'],
    ['top-level string', { status: '403' }, 'load_failed', 'load_failed'],
    [
      'malformed JSON API',
      {
        errors: [
          { status: 'bad', code: 'receipt_access_denied', detail: 'PRIVATE' },
        ],
      },
      'load_failed',
      'load_failed',
    ],
    [
      'semantic-only JSON API',
      { errors: [{ code: 'receipt_access_denied', detail: 'PRIVATE' }] },
      'load_failed',
      'load_failed',
    ],
    [
      'false auth flag',
      { isAuthError: false, message: 'PRIVATE' },
      'load_failed',
      'load_failed',
    ],
    [
      'JSON API precedence',
      {
        status: 500,
        statusCode: 401,
        errors: [{ status: '403', detail: 'PRIVATE' }],
      },
      'unavailable',
      'restricted',
    ],
    [
      'auth precedence',
      {
        isAuthError: true,
        status: 500,
        errors: [{ status: '403', detail: 'PRIVATE' }],
      },
      'unavailable',
      'unavailable',
    ],
    [
      'numeric JSON API code',
      { errors: [{ code: '404', detail: 'PRIVATE' }] },
      'unavailable',
      'unavailable',
    ],
    ...[NaN, Infinity, 403.5, 399, 600].map(
      (code) =>
        [
          `invalid numeric ${code}`,
          { status: code },
          'load_failed',
          'load_failed',
        ] as const,
    ),
  ] as const;
  it.each(transformedErrors)(
    'maps transformed metadata %s safely',
    async (_name, error, metadata) => {
      mocks.service.get.mockRejectedValueOnce(error);
      const { result } = renderHook(() => useBrandedGenerationReceipt(input));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe(metadata);
      expect(result.current.receipt).toBeNull();
      expect(result.current.prompts).toEqual({});
      expect(JSON.stringify(result.current)).not.toContain('PRIVATE');
    },
  );
  it.each(transformedErrors)(
    'maps transformed prompt %s and clears prior plaintext',
    async (_name, error, _metadata, expected) => {
      const { result } = renderHook(() => useBrandedGenerationReceipt(input));
      await waitFor(() => expect(result.current.receipt).not.toBeNull());
      await act(() => result.current.revealPrompt('original'));
      expect(result.current.prompts.original).toEqual(prompt());
      mocks.service.readPrompt.mockRejectedValueOnce(error);
      await act(() => result.current.revealPrompt('original'));
      expect(result.current.promptError).toBe(expected);
      expect(result.current.prompts).toEqual({});
      expect(JSON.stringify(result.current)).not.toContain('PRIVATE');
    },
  );
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
