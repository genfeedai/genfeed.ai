import { buildSerwistAsset } from '@app/serwist/serwist-asset.core';
import { cacheLife } from 'next/cache';

// Cache Components is on for every build profile. Compiling the worker reads
// the filesystem and loads Next's config, which is uncached I/O, so outside a
// cache scope Next leaves `/serwist/[path]` dynamic and compiles on every
// request. The Vercel function does not ship `next/dist/server/config.js`, so
// that request returned 500. Caching the compiled output here lets the build
// prerender `sw.js` and `sw.js.map` and ship them as static files.
export async function readSerwistAsset(
  file: Parameters<typeof buildSerwistAsset>[0],
) {
  'use cache';
  cacheLife({ expire: Infinity, revalidate: Infinity });
  return buildSerwistAsset(file);
}
