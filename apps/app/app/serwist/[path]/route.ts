import {
  isSerwistRouteFile,
  SERWIST_ESBUILD_OPTIONS,
  SERWIST_PRECACHE_GLOB_PATTERNS,
  SERWIST_ROUTE_FILES,
  type SerwistRouteFile,
} from '@app/serwist/serwist-options';
import { createSerwistRoute } from '@serwist/turbopack';
import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

/**
 * Compiles `app/sw.ts` and serves it from `/serwist/sw.js` with
 * `Service-Worker-Allowed: /`, injecting the precache manifest at
 * `self.__SW_MANIFEST`. `ServiceWorkerRegistrar` in the root layout
 * registers it as a classic worker.
 *
 * `useNativeEsbuild` picks the real esbuild binary (already a workspace
 * dependency) over the wasm build, which is markedly slower to start.
 */
const serwist = createSerwistRoute({
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

// Cache serializable data so a cold compiler read can complete during static
// prerendering. A Response cannot cross the Cache Components boundary.
async function readSerwistFile(file: SerwistRouteFile) {
  'use cache';
  cacheLife({ expire: Infinity, revalidate: Infinity });

  const response = await serwist.GET(
    new Request(`http://localhost/serwist/${file}`),
    { params: Promise.resolve({ path: file }) },
  );
  if (response.body === null) {
    throw new Error(`Serwist returned no body for ${file}`);
  }
  return { body: await response.text(), headers: [...response.headers] };
}

export async function GET(
  request: Request,
  { params }: RouteContext<'/serwist/[path]'>,
) {
  const { path } = await params;
  if (!isSerwistRouteFile(path)) notFound();

  if (process.env.NODE_ENV === 'development') {
    return serwist.GET(request, { params: Promise.resolve({ path }) });
  }

  const file = await readSerwistFile(path);
  return new Response(file.body, { headers: file.headers });
}

export async function generateStaticParams() {
  const generated = await serwist.generateStaticParams();
  const files = generated.map(({ path }) => path).sort();
  if (
    files.length !== SERWIST_ROUTE_FILES.length ||
    files.some((file, index) => file !== SERWIST_ROUTE_FILES[index])
  ) {
    throw new Error(
      `Serwist emitted ${files.join(', ')}; expected ${SERWIST_ROUTE_FILES.join(', ')}`,
    );
  }
  return SERWIST_ROUTE_FILES.map((path) => ({ path }));
}
