import type { IDesktopBootstrap } from '@genfeedai/contracts/desktop';
import type {
  CrunGenerationQuoteResponse,
  CrunImageQuoteRequest,
  CrunVideoQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type { UseCrunGenerationQuoteOptions } from '@genfeedai/props/studio/prompt-bar.props';
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
  videoQuote: vi.fn(),
  calls: [] as {
    endpoint: string;
    request: unknown;
    mediaKind: 'image' | 'video';
  }[],
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
          state.calls.push({ endpoint, request, mediaKind: 'image' });
          return state.quote(request, signal);
        },
      };
    },
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => {
      const endpoint = state.endpoint;
      return {
        quoteCrun: (request: unknown, signal: AbortSignal) => {
          state.calls.push({ endpoint, request, mediaKind: 'video' });
          return state.videoQuote(request, signal);
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
  state.videoQuote
    .mockReset()
    .mockImplementation(async (request: CrunVideoQuoteRequest) => ({
      ...available(),
      modelKey: request.model,
      contractVersion: request.crunControls.contractVersion,
    }));
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

const videoRequest: CrunVideoQuoteRequest = {
  model: 'crun/kling/v2-5-turbo-pro',
  text: request.text,
  brandId: 'brand-1',
  references: ['start-1'],
  endFrame: 'end-1',
  outputs: 4,
  crunControls: {
    contractVersion: 'video-reviewed',
    duration: 10,
    guidanceScale: 0,
  },
};
describe('media-discriminated scoped Crun quotes', () => {
  it('invalidates current image quote synchronously before video transport starts', async () => {
    const { result, rerender } = renderHook(
      ({ options }) => useCrunGenerationQuote(options),
      {
        initialProps: {
          options: { request, isActive: true } as UseCrunGenerationQuoteOptions,
        },
      },
    );
    await debounce();
    expect(result.current.getCurrentQuote()?.modelKey).toBe(request.model);
    rerender({
      options: { mediaKind: 'video', request: videoRequest, isActive: true },
    });
    expect(result.current.getCurrentQuote()).toBeNull();
    expect(result.current.status).toBe('pending');
    await debounce();
    expect(state.calls.map((call) => call.mediaKind)).toEqual([
      'image',
      'video',
    ]);
    expect(result.current.getCurrentQuote()?.modelKey).toBe(videoRequest.model);
    expect(state.videoQuote.mock.calls[0]?.[0]).toEqual(videoRequest);
  });
  it('aborts an old-media request and ignores its late completion', async () => {
    let resolveOld: ((quote: CrunGenerationQuoteResponse) => void) | undefined;
    state.quote.mockImplementationOnce(
      () =>
        new Promise<CrunGenerationQuoteResponse>((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ options }) => useCrunGenerationQuote(options),
      {
        initialProps: {
          options: { request, isActive: true } as UseCrunGenerationQuoteOptions,
        },
      },
    );
    await debounce();
    rerender({
      options: { mediaKind: 'video', request: videoRequest, isActive: true },
    });
    expect(state.quote.mock.calls[0]?.[1]).toHaveProperty('aborted', true);
    await debounce();
    await act(async () => {
      resolveOld?.(available());
    });
    expect(result.current.getCurrentQuote()?.modelKey).toBe(videoRequest.model);
  });
  it('checks category after delayed token resolution before HTTP', async () => {
    let resolveToken: ((token: string) => void) | undefined;
    state.auth.getToken = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const { rerender } = renderHook(
      ({ options }) => useCrunGenerationQuote(options),
      {
        initialProps: {
          options: { request, isActive: true } as UseCrunGenerationQuoteOptions,
        },
      },
    );
    await debounce();
    rerender({
      options: { mediaKind: 'video', request: videoRequest, isActive: true },
    });
    await act(async () => {
      resolveToken?.('token');
    });
    expect(state.calls).toHaveLength(0);
  });
  it.each(['frames', 'duration', 'version', 'brand', 'endpoint'])(
    'invalidates video scope when %s changes',
    async (change) => {
      let current = videoRequest;
      const { result, rerender } = renderHook(() =>
        useCrunGenerationQuote({
          mediaKind: 'video',
          request: current,
          isActive: true,
        }),
      );
      await debounce();
      if (change === 'frames') current = { ...current, endFrame: 'end-2' };
      if (change === 'duration')
        current = {
          ...current,
          crunControls: { ...current.crunControls, duration: 5 },
        };
      if (change === 'version')
        current = {
          ...current,
          crunControls: {
            ...current.crunControls,
            contractVersion: 'new-video',
          },
        };
      if (change === 'brand')
        state.brand = { ...state.brand, brandId: 'brand-2' };
      if (change === 'endpoint') state.endpoint = 'https://two.example/api/';
      rerender();
      expect(result.current.getCurrentQuote()).toBeNull();
      await debounce();
      expect(state.videoQuote).toHaveBeenCalledTimes(2);
      expect(state.quote).not.toHaveBeenCalled();
    },
  );
  it('keeps video group credits direct and rejects expired admission', async () => {
    state.videoQuote.mockResolvedValueOnce({
      ...available(),
      modelKey: videoRequest.model,
      contractVersion: videoRequest.crunControls.contractVersion,
      credits: 11,
    });
    const { result } = renderHook(() =>
      useCrunGenerationQuote({
        mediaKind: 'video',
        request: videoRequest,
        isActive: true,
      }),
    );
    await debounce();
    expect(result.current.getCurrentQuote()?.credits).toBe(11);
    vi.setSystemTime(new Date('2026-10-01T12:01:01.000Z'));
    expect(result.current.getCurrentQuote()).toBeNull();
  });
  it('leaves video inactive/null requests unavailable without falling back to images', async () => {
    const { result } = renderHook(() =>
      useCrunGenerationQuote({
        mediaKind: 'video',
        request: null,
        isActive: true,
      }),
    );
    await debounce();
    expect(result.current.status).toBe('idle');
    expect(state.calls).toHaveLength(0);
  });
});

describe('video quote modes and return-to-image isolation', () => {
  it.each(['credits', 'byok'] as const)(
    'retains genuine zero %s separately from unavailable',
    async (billingMode) => {
      state.videoQuote.mockResolvedValueOnce({
        ...available(),
        modelKey: videoRequest.model,
        contractVersion: videoRequest.crunControls.contractVersion,
        credits: 0,
        billingMode,
      });
      const { result, rerender } = renderHook(
        ({ active }) =>
          useCrunGenerationQuote({
            mediaKind: 'video',
            request: videoRequest,
            isActive: active,
          }),
        { initialProps: { active: true } },
      );
      await debounce();
      expect(result.current.getCurrentQuote()).toMatchObject({
        credits: 0,
        billingMode,
      });
      rerender({ active: false });
      expect(result.current.getCurrentQuote()).toBeNull();
      expect(result.current.quote).toBeNull();
    },
  );
  it('never substitutes a numeric price for unavailable video', async () => {
    state.videoQuote.mockResolvedValueOnce({
      isAvailable: false,
      modelKey: videoRequest.model,
      quoteId: null,
      expiresAt: null,
      contractVersion: null,
      credits: null,
      billingMode: null,
      reasonCode: 'PRICING_UNAVAILABLE',
    });
    const { result } = renderHook(() =>
      useCrunGenerationQuote({
        mediaKind: 'video',
        request: videoRequest,
        isActive: true,
      }),
    );
    await debounce();
    expect(result.current.status).toBe('unavailable');
    expect(result.current.quote?.credits).toBeNull();
    expect(result.current.getCurrentQuote()).toBeNull();
  });
  it('switches back to the image service and rejects a late video response', async () => {
    let resolveVideo:
      | ((quote: CrunGenerationQuoteResponse) => void)
      | undefined;
    state.videoQuote.mockImplementationOnce(
      () =>
        new Promise<CrunGenerationQuoteResponse>((resolve) => {
          resolveVideo = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ options }) => useCrunGenerationQuote(options),
      {
        initialProps: {
          options: {
            mediaKind: 'video',
            request: videoRequest,
            isActive: true,
          } as UseCrunGenerationQuoteOptions,
        },
      },
    );
    await debounce();
    rerender({ options: { request, isActive: true } });
    await debounce();
    await act(async () => {
      resolveVideo?.({
        ...available(),
        modelKey: videoRequest.model,
        contractVersion: videoRequest.crunControls.contractVersion,
      });
    });
    expect(state.calls.map((call) => call.mediaKind)).toEqual([
      'video',
      'image',
    ]);
    expect(result.current.getCurrentQuote()?.modelKey).toBe(request.model);
  });
});
