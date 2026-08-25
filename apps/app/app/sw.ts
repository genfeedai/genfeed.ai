import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis;

const OFFLINE_FALLBACK_URL = '/~offline';
const ONE_DAY_SECONDS = 60 * 60 * 24;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Static, non-tenant-scoped assets only.
 *
 * Cache Storage is origin-scoped, not session-scoped: whatever lands here
 * survives sign-out and is readable by the next account to use the browser.
 * The studio is multi-tenant, so documents, RSC payloads and API responses are
 * deliberately never cached. `@serwist/turbopack`'s `defaultCache` caches all
 * three (`pages`, `pages-rsc`, `apis` — plus a same-origin catch-all), which is
 * why it is not used here.
 *
 * The trailing NetworkOnly catch-all makes that guarantee explicit rather than
 * incidental: a response is cached only if a rule above it opts the response
 * in, so adding a route never silently starts caching tenant data.
 */
const runtimeCaching: RuntimeCaching[] = [
  {
    handler: new CacheFirst({
      cacheName: 'next-static-assets',
      plugins: [
        new ExpirationPlugin({
          maxAgeFrom: 'last-used',
          maxAgeSeconds: 30 * ONE_DAY_SECONDS,
          maxEntries: 128,
        }),
      ],
    }),
    // Content-hashed by the build, so a cache hit can never be stale.
    matcher: /\/_next\/static\/.+\.(?:js|css|woff2?)$/i,
  },
  {
    handler: new CacheFirst({
      cacheName: 'genfeed-cdn-assets',
      plugins: [
        new ExpirationPlugin({
          maxAgeFrom: 'last-used',
          maxAgeSeconds: 30 * ONE_DAY_SECONDS,
          maxEntries: 200,
        }),
      ],
    }),
    matcher: /^https:\/\/(?:staging-)?cdn\.genfeed\.ai\/.*/i,
  },
  {
    handler: new CacheFirst({
      cacheName: 'google-fonts-webfonts',
      plugins: [
        new ExpirationPlugin({
          maxAgeFrom: 'last-used',
          maxAgeSeconds: 365 * ONE_DAY_SECONDS,
          maxEntries: 8,
        }),
      ],
    }),
    matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
  },
  {
    handler: new StaleWhileRevalidate({
      cacheName: 'google-fonts-stylesheets',
      plugins: [
        new ExpirationPlugin({
          maxAgeFrom: 'last-used',
          maxAgeSeconds: 7 * ONE_DAY_SECONDS,
          maxEntries: 8,
        }),
      ],
    }),
    matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
  },
  {
    handler: new StaleWhileRevalidate({
      cacheName: 'next-image',
      plugins: [
        new ExpirationPlugin({
          maxAgeFrom: 'last-used',
          maxAgeSeconds: ONE_DAY_SECONDS,
          maxEntries: 64,
        }),
      ],
    }),
    // The optimizer only ever serves images it was given a public URL for.
    matcher: /\/_next\/image\?url=.+$/i,
  },
  {
    handler: new NetworkOnly(),
    matcher: /.*/i,
  },
];

/**
 * Installs the studio service worker.
 *
 * Precaches the build's static assets plus the offline shell, serves the
 * offline page when a document request fails, and otherwise stays out of the
 * way — see {@link runtimeCaching} for why nothing tenant-scoped is cached.
 *
 * `skipWaiting`/`clientsClaim` are off on purpose: an updated worker takes over
 * on the next full load instead of swapping under an open tab. Refresh prompts
 * are owned by `DeploymentVersionWatcher`, which never force-reloads so an
 * in-progress edit in the studio is never discarded.
 */
function createServiceWorker(): void {
  const serwist = new Serwist({
    clientsClaim: false,
    fallbacks: {
      entries: [
        {
          matcher({ request }) {
            return request.destination === 'document';
          },
          url: OFFLINE_FALLBACK_URL,
        },
      ],
    },
    navigationPreload: true,
    precacheEntries: self.__SW_MANIFEST,
    // In development every request is NetworkOnly anyway, so the runtime rules
    // would only add noise to an already-cold Turbopack compile.
    runtimeCaching: isProduction
      ? runtimeCaching
      : [{ handler: new NetworkOnly(), matcher: /.*/i }],
    skipWaiting: false,
  });

  serwist.addEventListeners();
}

createServiceWorker();
