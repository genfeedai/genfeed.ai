import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from 'serwist';
import { Serwist } from 'serwist';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAddEventListeners = vi.fn();

vi.mock('@serwist/next/worker', () => ({
  defaultCache: [
    {
      handler: 'CacheFirst',
      urlPattern: /default-cache/i,
    },
  ],
}));

vi.mock('serwist', () => ({
  Serwist: vi.fn().mockImplementation(function SerwistMock() {
    return {
      addEventListeners: mockAddEventListeners,
    };
  }),
}));

import { createServiceWorker } from '@ui/pwa/sw.template';

type SerwistOptions = {
  clientsClaim: boolean;
  fallbacks: {
    entries: Array<{
      matcher: (input: { request: Request }) => boolean;
      url: string;
    }>;
  };
  navigationPreload: boolean;
  precacheEntries: (PrecacheEntry | string)[] | undefined;
  runtimeCaching: unknown[];
  skipWaiting: boolean;
};

describe('sw.template', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates serwist instance with shared caching and fallbacks', () => {
    const globalSelf = globalThis as unknown as {
      self?: { __SW_MANIFEST?: (PrecacheEntry | string)[] };
    };

    if (!globalSelf.self) {
      globalSelf.self = {};
    }

    globalSelf.self.__SW_MANIFEST = ['precache-entry'];

    createServiceWorker('/~offline');

    const mockSerwist = vi.mocked(Serwist);
    expect(mockSerwist).toHaveBeenCalledTimes(1);

    const options = mockSerwist.mock.calls[0]?.[0] as SerwistOptions;
    expect(options.clientsClaim).toBe(true);
    expect(options.navigationPreload).toBe(true);
    expect(options.skipWaiting).toBe(true);
    expect(options.fallbacks.entries[0].url).toBe('/~offline');
    expect(options.runtimeCaching).toHaveLength(defaultCache.length + 5);

    const matcher = options.fallbacks.entries[0].matcher;
    const result = matcher({
      request: { destination: 'document' } as Request,
    });
    expect(result).toBe(true);

    expect(options.precacheEntries).toEqual(['precache-entry']);
    expect(mockAddEventListeners).toHaveBeenCalled();
  });
});
