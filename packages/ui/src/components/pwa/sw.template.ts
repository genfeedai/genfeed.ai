import { defaultCache } from '@serwist/next/worker';
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

const genfeedCacheStrategies = [
  {
    handler: 'CacheFirst',
    options: {
      cacheableResponse: {
        statuses: [0, 200],
      },
      cacheName: 'genfeed-cdn-cache',
      expiration: {
        maxAgeSeconds: 60 * 60 * 24 * 30,
        maxEntries: 200,
      },
    },
    urlPattern: /^https:\/\/cdn\.genfeed\.ai\/.*/i,
  },
  {
    handler: 'CacheFirst',
    options: {
      cacheableResponse: {
        statuses: [0, 200],
      },
      cacheName: 'genfeed-staging-cdn-cache',
      expiration: {
        maxAgeSeconds: 60 * 60 * 24 * 7,
        maxEntries: 100,
      },
    },
    urlPattern: /^https:\/\/staging-cdn\.genfeed\.ai\/.*/i,
  },
  {
    handler: 'NetworkFirst',
    options: {
      cacheName: 'genfeed-api-cache',
      expiration: {
        maxAgeSeconds: 60 * 5,
        maxEntries: 50,
      },
      networkTimeoutSeconds: 10,
    },
    urlPattern: /^https:\/\/api\.genfeed\.ai\/.*/i,
  },
  {
    handler: 'CacheFirst',
    options: {
      cacheName: 'google-fonts-cache',
      expiration: {
        maxAgeSeconds: 60 * 60 * 24 * 365,
        maxEntries: 30,
      },
    },
    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  },
  {
    handler: 'NetworkFirst',
    options: {
      cacheName: 'clerk-cache',
      expiration: {
        maxAgeSeconds: 60 * 60,
        maxEntries: 20,
      },
      networkTimeoutSeconds: 5,
    },
    urlPattern: /^https:\/\/.*\.clerk\.(com|dev)\/.*/i,
  },
];

export function createServiceWorker(offlineFallbackUrl: string): void {
  const serwist = new Serwist({
    clientsClaim: true,
    fallbacks: {
      entries: [
        {
          matcher({ request }) {
            return request.destination === 'document';
          },
          url: offlineFallbackUrl,
        },
      ],
    },
    navigationPreload: true,
    precacheEntries: self.__SW_MANIFEST,
    runtimeCaching: [
      ...defaultCache,
      ...genfeedCacheStrategies,
    ] as RuntimeCaching[],
    skipWaiting: true,
  });

  serwist.addEventListeners();
}
