import type { IDesktopBootstrap } from '@genfeedai/contracts/desktop';
import type {
  CrunGenerationQuoteResponse,
  CrunImageQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCrunGenerationQuote } from './use-crun-generation-quote';

const state = vi.hoisted(() => ({
  endpoint: 'https://one.example/api/',
  desktop: false,
  auth: {
    isLoaded: true,
    isSignedIn: true,
    sessionId: 'session-1',
    userId: 'user-1',
    orgId: null as string | null,
    getToken: vi.fn(async () => 'token'),
  },
  brand: { isReady: true, organizationId: 'org-1', brandId: 'brand-1' },
  quote: vi.fn(),
  calls: [] as { endpoint: string; request: unknown }[],
  bootstrapListener: null as ((bootstrap: unknown) => void) | null,
  bootstrap: vi.fn(),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => state.desktop,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => state.auth,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => state.brand,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return state.endpoint;
    },
  },
}));
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => {
      const endpoint = state.endpoint;
      return {
        quoteCrun: (request: unknown, signal: AbortSignal) => {
          state.calls.push({ endpoint, request });
          return state.quote(request, signal);
        },
      };
    },
  },
}));

const request: CrunImageQuoteRequest = {
  model: 'crun/google/nano-banana-pro',
  text: 'Ceramic bird',
  references: [],
  outputs: 1,
  crunControls: {
    contractVersion: 'reviewed-1',
    aspectRatio: '1:1',
    resolution: '1K',
    outputFormat: 'png',
  },
  harness: false,
};
function available(): CrunGenerationQuoteResponse {
  return {
    isAvailable: true,
    quoteId: 'opaque',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    modelKey: request.model,
    contractVersion: request.crunControls.contractVersion,
    credits: 12,
    billingMode: 'credits',
    reasonCode: null,
  };
}
async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  state.endpoint = 'https://one.example/api/';
  state.desktop = false;
  state.auth = {
    isLoaded: true,
    isSignedIn: true,
    sessionId: 'session-1',
    userId: 'user-1',
    orgId: null,
    getToken: vi.fn(async () => 'token'),
  };
  state.brand = { isReady: true, organizationId: 'org-1', brandId: 'brand-1' };
  state.calls = [];
  state.quote.mockReset().mockImplementation(async () => available());
  state.bootstrapListener = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scoped Crun quote lifecycle', () => {
  it('debounces the non-generating request and expires admission synchronously', async () => {
    const { result } = renderHook(() =>
      useCrunGenerationQuote({ request, isActive: true }),
    );
    expect(result.current.status).toBe('pending');
    expect(state.calls).toHaveLength(0);
    await debounce();
    expect(state.calls).toHaveLength(1);
    expect(result.current.getCurrentQuote()?.credits).toBe(12);
    vi.setSystemTime(new Date('2026-10-01T12:01:01.000Z'));
    expect(result.current.getCurrentQuote()).toBeNull();
  });
  it.each(['sessionId', 'userId', 'orgId'] as const)(
    'invalidates a quote after auth %s changes',
    async (key) => {
      const { result, rerender } = renderHook(() =>
        useCrunGenerationQuote({ request, isActive: true }),
      );
      await debounce();
      state.auth = { ...state.auth, [key]: 'rotated' };
      rerender();
      expect(result.current.getCurrentQuote()).toBeNull();
      expect(result.current.quote).toBeNull();
      await debounce();
      expect(state.calls).toHaveLength(2);
    },
  );
  it.each(['organizationId', 'brandId'] as const)(
    'invalidates a quote after selected %s changes',
    async (key) => {
      const { result, rerender } = renderHook(() =>
        useCrunGenerationQuote({ request, isActive: true }),
      );
      await debounce();
      state.brand = { ...state.brand, [key]: 'changed' };
      rerender();
      expect(result.current.getCurrentQuote()).toBeNull();
      await debounce();
      expect(state.calls).toHaveLength(2);
    },
  );
  it('targets the new endpoint with the same token and rejects a late old-server response', async () => {
    let resolveOld: ((quote: CrunGenerationQuoteResponse) => void) | undefined;
    state.quote.mockImplementationOnce(
      () =>
        new Promise<CrunGenerationQuoteResponse>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(() =>
      useCrunGenerationQuote({ request, isActive: true }),
    );
    await debounce();
    state.endpoint = 'https://two.example/api/';
    rerender();
    await debounce();
    await act(async () => {
      resolveOld?.({
        ...available(),
        quoteId: 'old-server',
      } as CrunGenerationQuoteResponse);
    });
    expect(state.calls.map((entry) => entry.endpoint)).toEqual([
      'https://one.example/api/',
      'https://two.example/api/',
    ]);
    expect(result.current.getCurrentQuote()?.quoteId).toBe('opaque');
  });
  it('sends no obsolete request when token lookup finishes after logout', async () => {
    let resolveToken: ((token: string) => void) | undefined;
    state.auth.getToken = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const { result, rerender } = renderHook(() =>
      useCrunGenerationQuote({ request, isActive: true }),
    );
    await debounce();
    state.auth = { ...state.auth, isSignedIn: false };
    rerender();
    await act(async () => {
      resolveToken?.('token');
    });
    expect(state.calls).toHaveLength(0);
    expect(result.current.getCurrentQuote()).toBeNull();
  });
  it('keeps unavailable prices distinct from legitimate BYOK zero', async () => {
    state.quote.mockResolvedValueOnce({
      isAvailable: false,
      quoteId: null,
      expiresAt: null,
      modelKey: request.model,
      contractVersion: null,
      credits: null,
      billingMode: null,
      reasonCode: 'PRICING_UNAVAILABLE',
    });
    const { result, rerender } = renderHook(
      ({ draft }) => useCrunGenerationQuote({ request: draft, isActive: true }),
      { initialProps: { draft: request } },
    );
    await debounce();
    expect(result.current.status).toBe('unavailable');
    expect(result.current.getCurrentQuote()).toBeNull();
    state.quote.mockResolvedValueOnce({
      ...available(),
      credits: 0,
      billingMode: 'byok',
    });
    rerender({ draft: { ...request, text: 'New intent' } });
    await debounce();
    expect(result.current.getCurrentQuote()?.credits).toBe(0);
  });
  it('subscribes before bootstrap and rejects a late initial server snapshot', async () => {
    state.desktop = true;
    let resolveInitial: ((bootstrap: IDesktopBootstrap) => void) | undefined;
    const subscribe = vi.fn((callback: (bootstrap: unknown) => void) => {
      state.bootstrapListener = callback;
      return () => {};
    });
    const initial = vi.fn(
      () =>
        new Promise<IDesktopBootstrap>((resolve) => {
          resolveInitial = resolve;
        }),
    );
    vi.stubGlobal('genfeedDesktop', {
      app: { onDidBootstrapChange: subscribe, getBootstrap: initial },
    });
    const { result } = renderHook(() =>
      useCrunGenerationQuote({ request, isActive: true }),
    );
    expect(subscribe.mock.invocationCallOrder[0]).toBeLessThan(
      initial.mock.invocationCallOrder[0] ?? 0,
    );
    await act(async () => {
      state.bootstrapListener?.({
        environment: { serverId: 'new-server', apiEndpoint: state.endpoint },
      });
    });
    await debounce();
    expect(result.current.getCurrentQuote()).not.toBeNull();
    await act(async () => {
      resolveInitial?.({
        environment: {
          serverId: 'old-server',
          apiEndpoint: 'https://old.example/api/',
        },
      } as IDesktopBootstrap);
    });
    expect(result.current.getCurrentQuote()).not.toBeNull();
    expect(state.calls).toHaveLength(1);
    await act(async () => {
      state.bootstrapListener?.({
        environment: { serverId: 'new-server', apiEndpoint: state.endpoint },
      });
      expect(result.current.getCurrentQuote()).toBeNull();
    });
    await debounce();
    expect(state.calls).toHaveLength(2);
  });
  it('requires matching desktop endpoint and ready auth/brand scope', async () => {
    state.desktop = true;
    vi.stubGlobal('genfeedDesktop', {
      app: {
        onDidBootstrapChange: () => () => {},
        getBootstrap: async () => ({
          environment: {
            serverId: 'server',
            apiEndpoint: 'https://mismatch.example/',
          },
        }),
      },
    });
    const { result } = renderHook(() =>
      useCrunGenerationQuote({ request, isActive: true }),
    );
    await debounce();
    expect(state.calls).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });
});
