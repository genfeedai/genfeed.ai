/**
 * Classic service-worker compile options for `/serwist/sw.js`.
 *
 * `@serwist/turbopack` defaults to esbuild `format: "esm"`. Browsers load
 * this URL as a classic worker (ServiceWorkerRegistrar does not pass
 * `type: "module"`), so a leftover `export` throws
 * `Uncaught SyntaxError: Unexpected token 'export'`.
 *
 * Precache is the offline shell plus public PWA icons — not the Next.js
 * build. Runtime caching in `app/sw.ts` already CacheFirsts hashed
 * `/_next/static` assets. Globbing `.next/static/**` on Vercel pulled in
 * thousands of `_next/static/dev/` turbopack chunks and bloated the worker.
 */
export const SERWIST_ESBUILD_OPTIONS = {
  format: 'iife',
} as const;

export const SERWIST_PRECACHE_GLOB_PATTERNS = [
  'public/assets/pwa/**/*.{png,svg,webmanifest}',
  'public/favicon.ico',
  'public/logo.svg',
  'public/sounds/task-complete.mp3',
] as const;
