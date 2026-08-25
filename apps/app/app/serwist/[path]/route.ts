import { createSerwistRoute } from '@serwist/turbopack';
import {
  SERWIST_ESBUILD_OPTIONS,
  SERWIST_PRECACHE_GLOB_PATTERNS,
} from '../serwist-options';

/**
 * Compiles `app/sw.ts` and serves it from `/serwist/sw.js` with
 * `Service-Worker-Allowed: /`, injecting the precache manifest at
 * `self.__SW_MANIFEST`. `ServiceWorkerRegistrar` in the root layout
 * registers it as a classic worker.
 *
 * `useNativeEsbuild` picks the real esbuild binary (already a workspace
 * dependency) over the wasm build, which is markedly slower to start.
 */
export const { dynamic, dynamicParams, generateStaticParams, GET, revalidate } =
  createSerwistRoute({
    // Precached so the fallback is there on a cold, offline load. The revision
    // is the build id: the URL never changes, so without it the precached copy
    // would survive every deploy.
    additionalPrecacheEntries: [
      { revision: process.env.NEXT_PUBLIC_BUILD_ID ?? null, url: '/~offline' },
    ],
    esbuildOptions: { ...SERWIST_ESBUILD_OPTIONS },
    globPatterns: [...SERWIST_PRECACHE_GLOB_PATTERNS],
    swSrc: 'app/sw.ts',
    useNativeEsbuild: true,
  });
