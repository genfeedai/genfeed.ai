import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { BrandIdentityPreviewInput } from '@genfeedai/props/content/branded-generation-receipt.props';
import type { AuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useBrandIdentityPreview } from '@hooks/ui/generation-receipts/use-brand-identity-preview';
import {
  axiosResponse,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getToken = vi.fn<() => Promise<string | null>>();
  const auth: AuthIdentity = {
    getToken,
    userId: 'user',
    sessionId: 'session',
    orgId: 'org',
    isLoaded: true,
    isSignedIn: true,
  };
  return { getToken, auth, role: 'owner' };
});
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.auth,
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
const hash = `sha256:${'a'.repeat(64)}`;
function snapshot(
  revisionId = 'A',
  brandId = 'brand',
): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId,
    revisionId,
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-02T00:00:00.000Z',
    contentHash: hash,
    identity: { name: revisionId },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
}
function response(revisionId = 'A', brandId = 'brand') {
  return axiosResponse(
    resourceDocument(
      {
        snapshot: snapshot(revisionId, brandId),
        source: 'current_approved_revision',
      },
      { id: hash, type: 'brand-identity-preview' },
    ),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const input: BrandIdentityPreviewInput = {
  organizationId: 'org',
  brandId: 'brand',
  refreshKey: 'saved-A',
  isOpen: true,
};
function setup() {
  const service = new BrandedGenerationReceiptsService('test-token');
  const http = installMockHttp(service);
  vi.spyOn(BrandedGenerationReceiptsService, 'getInstance').mockReturnValue(
    service,
  );
  http.get.mockResolvedValue(response());
  return { service, http };
}
describe('current identity preview authenticated request epochs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getToken.mockReset().mockResolvedValue('test-token');
    Object.assign(mocks.auth, {
      getToken: mocks.getToken,
      userId: 'user',
      sessionId: 'session',
      orgId: 'org',
      isLoaded: true,
      isSignedIn: true,
    });
    mocks.role = 'owner';
  });
  it('performs only a current SDK GET with an abort signal and no mutation or prompt access', async () => {
    const { service, http } = setup();
    const prompt = vi.spyOn(service, 'readPrompt');
    const { result } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() =>
      expect(result.current.result?.snapshot.revisionId).toBe('A'),
    );
    expect(http.get).toHaveBeenCalledExactlyOnceWith(
      'brand/generation-receipts/identity-preview',
      { signal: expect.any(AbortSignal) },
    );
    expect(prompt).not.toHaveBeenCalled();
    for (const method of ['post', 'patch', 'put', 'delete'] as const)
      expect(http[method]).not.toHaveBeenCalled();
  });
  it('does not resolve tokens or request while closed', () => {
    const { http } = setup();
    const { result } = renderHook(() =>
      useBrandIdentityPreview({ ...input, isOpen: false }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['organizationId', 'brandId'] as const)(
    'rejects missing %s before token and HTTP',
    (key) => {
      const { http } = setup();
      renderHook(() => useBrandIdentityPreview({ ...input, [key]: '' }));
      expect(mocks.getToken).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
    },
  );
  it.each(['isLoaded', 'isSignedIn'] as const)(
    'does not resolve tokens without authenticated readiness %s',
    (key) => {
      const { http } = setup();
      mocks.auth[key] = false;
      const { result } = renderHook(() => useBrandIdentityPreview(input));
      expect(result.current.error).toBe('unavailable');
      expect(mocks.getToken).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
    },
  );
  it.each(['userId', 'sessionId', 'orgId'] as const)(
    'invalidates the old deferred token before HTTP when auth %s changes',
    async (key) => {
      const { http } = setup();
      const token = deferred<string | null>();
      mocks.getToken.mockReturnValueOnce(token.promise);
      const { result, rerender } = renderHook(() =>
        useBrandIdentityPreview(input),
      );
      await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
      mocks.auth[key] = 'new-auth';
      rerender();
      await waitFor(() =>
        expect(result.current.result?.snapshot.revisionId).toBe('A'),
      );
      await act(async () => {
        token.resolve('old-token');
        await token.promise;
      });
      expect(http.get).toHaveBeenCalledTimes(1);
    },
  );
  it('fences a role change even when the token service callback is unchanged', async () => {
    const { http } = setup();
    const token = deferred<string | null>();
    mocks.getToken.mockReturnValueOnce(token.promise);
    const { result, rerender } = renderHook(() =>
      useBrandIdentityPreview(input),
    );
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    mocks.role = 'user';
    rerender();
    await waitFor(() => expect(result.current.result).not.toBeNull());
    await act(async () => {
      token.resolve('old-token');
      await token.promise;
    });
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('uses the current token getter after auth changes, never the previous passive ref', async () => {
    const { http } = setup();
    const old = deferred<string | null>();
    mocks.getToken.mockReturnValue(old.promise);
    const { result, rerender } = renderHook(() =>
      useBrandIdentityPreview(input),
    );
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    const newGetter = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue('new-token');
    mocks.auth.getToken = newGetter;
    mocks.auth.sessionId = 'new-session';
    rerender();
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(newGetter).toHaveBeenCalledTimes(1);
    expect(mocks.getToken).toHaveBeenCalledTimes(1);
    expect(BrandedGenerationReceiptsService.getInstance).toHaveBeenCalledWith(
      'new-token',
    );
    await act(async () => {
      old.resolve('old-token');
      await old.promise;
    });
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it.each(['brandId', 'organizationId', 'refreshKey'] as const)(
    'prevents a stale token request after context %s changes',
    async (key) => {
      const { http } = setup();
      const token = deferred<string | null>();
      mocks.getToken.mockReturnValueOnce(token.promise);
      const { rerender } = renderHook(
        (props) => useBrandIdentityPreview(props),
        { initialProps: input },
      );
      await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
      rerender({ ...input, [key]: 'changed' });
      await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
      await act(async () => {
        token.resolve('old-token');
        await token.promise;
      });
      expect(http.get).toHaveBeenCalledTimes(1);
    },
  );
  it('hides old-scope data on every render before effects', async () => {
    const { http } = setup();
    const seen: { brandId: string; revision: string | undefined }[] = [];
    const { result, rerender } = renderHook(
      (props) => {
        const state = useBrandIdentityPreview(props);
        seen.push({
          brandId: props.brandId,
          revision: state.result?.snapshot.revisionId,
        });
        return state;
      },
      { initialProps: input },
    );
    await waitFor(() =>
      expect(result.current.result?.snapshot.revisionId).toBe('A'),
    );
    http.get.mockReturnValueOnce(new Promise(() => {}));
    rerender({ ...input, brandId: 'brand-B' });
    expect(result.current.result).toBeNull();
    expect(
      seen
        .filter((item) => item.brandId === 'brand-B')
        .every((item) => item.revision === undefined),
    ).toBe(true);
  });
  it('discards old success after a newer scope and cannot revive A after A→B→A', async () => {
    const { http } = setup();
    const old = deferred<ReturnType<typeof response>>();
    http.get
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response('B', 'brand-B'))
      .mockResolvedValueOnce(response('A-new'));
    const { result, rerender } = renderHook(
      (props) => useBrandIdentityPreview(props),
      { initialProps: input },
    );
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    rerender({ ...input, brandId: 'brand-B' });
    await waitFor(() =>
      expect(result.current.result?.snapshot.revisionId).toBe('B'),
    );
    rerender(input);
    await waitFor(() =>
      expect(result.current.result?.snapshot.revisionId).toBe('A-new'),
    );
    await act(async () => {
      old.resolve(response('A-old'));
      await old.promise;
    });
    expect(result.current.result?.snapshot.revisionId).toBe('A-new');
    expect(http.get.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('ignores old rejection and finalizer while the newer request remains loading', async () => {
    const { http } = setup();
    const old = deferred<ReturnType<typeof response>>();
    const fresh = deferred<ReturnType<typeof response>>();
    http.get
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(
      (props) => useBrandIdentityPreview(props),
      { initialProps: input },
    );
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    rerender({ ...input, brandId: 'brand-B' });
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(2));
    await act(async () => {
      old.reject(new Error('PRIVATE_OLD_ERROR'));
      await old.promise.catch(() => {});
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      fresh.resolve(response('B', 'brand-B'));
      await fresh.promise;
    });
    expect(result.current.result?.snapshot.revisionId).toBe('B');
  });
  it('refresh clears successful evidence and a failed refresh never leaves it visible', async () => {
    const { http } = setup();
    const { result } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    http.get.mockRejectedValueOnce({
      errors: [{ status: 403, detail: 'PRIVATE_BODY' }],
    });
    act(() => result.current.refresh());
    expect(result.current.result).toBeNull();
    await waitFor(() => expect(result.current.error).toBe('unavailable'));
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
  it('close aborts delayed HTTP and cannot revive evidence', async () => {
    const { http } = setup();
    const pending = deferred<ReturnType<typeof response>>();
    http.get.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    act(() => result.current.close());
    expect(http.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response());
      await pending.promise;
    });
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
  it('closing during token resolution sends no HTTP', async () => {
    const { http } = setup();
    const token = deferred<string | null>();
    mocks.getToken.mockReturnValueOnce(token.promise);
    const { rerender } = renderHook((props) => useBrandIdentityPreview(props), {
      initialProps: input,
    });
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    rerender({ ...input, isOpen: false });
    await act(async () => {
      token.resolve('old');
      await token.promise;
    });
    expect(http.get).not.toHaveBeenCalled();
  });
  it('unmount during token resolution sends no HTTP', async () => {
    const { http } = setup();
    const token = deferred<string | null>();
    mocks.getToken.mockReturnValueOnce(token.promise);
    const { unmount } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      token.resolve('old');
      await token.promise;
    });
    expect(http.get).not.toHaveBeenCalled();
  });
  it('unmount aborts delayed HTTP and prevents success and finalizer state updates', async () => {
    const { http } = setup();
    const pending = deferred<ReturnType<typeof response>>();
    http.get.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() =>
      useBrandIdentityPreview(input),
    );
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    const before = result.current;
    unmount();
    expect(http.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response());
      await pending.promise;
    });
    expect(result.current).toBe(before);
  });
  it.each([
    { reason: 'brand_identity_integrity_failed', expected: 'integrity_failed' },
    {
      reason: 'brand_identity_asset_unavailable',
      expected: 'assets_unavailable',
    },
    { reason: 'brand_identity_unavailable', expected: 'unavailable' },
    { reason: 'PRIVATE_UNRECOGNIZED_BODY', expected: 'load_failed' },
  ])('maps only known safe reason $reason', async ({ reason, expected }) => {
    const { http } = setup();
    http.get.mockRejectedValueOnce({
      errors: [{ code: '409', status: 409, detail: reason }],
    });
    const { result } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() => expect(result.current.error).toBe(expected));
    expect(result.current.result).toBeNull();
  });
  it('rejects a malformed or foreign current response and never exposes its evidence', async () => {
    const { http } = setup();
    http.get.mockResolvedValueOnce(response('FOREIGN', 'foreign'));
    const { result } = renderHook(() => useBrandIdentityPreview(input));
    await waitFor(() => expect(result.current.error).toBe('integrity_failed'));
    expect(result.current.result).toBeNull();
  });
});
