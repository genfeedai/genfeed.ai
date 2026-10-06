import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { createSerwistRoute } from '@serwist/turbopack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SerwistRoute = ReturnType<typeof createSerwistRoute>;
const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  factory: vi.fn(),
  GET: vi.fn<SerwistRoute['GET']>(),
  generateStaticParams: vi.fn<SerwistRoute['generateStaticParams']>(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@serwist/turbopack', () => ({
  createSerwistRoute: (options: Parameters<typeof createSerwistRoute>[0]) => {
    mocks.factory(options);
    return {
      dynamic: 'force-static',
      dynamicParams: false,
      generateStaticParams: mocks.generateStaticParams,
      GET: mocks.GET,
      revalidate: false,
    };
  },
}));
vi.mock('next/cache', () => ({ cacheLife: mocks.cacheLife }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'serwist-test-build');
  mocks.generateStaticParams.mockResolvedValue([
    { path: 'sw.js.map' },
    { path: 'sw.js' },
  ]);
  mocks.GET.mockResolvedValue(
    new Response('worker payload', {
      headers: {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
      },
    }) as Awaited<ReturnType<SerwistRoute['GET']>>,
  );
});

function request() {
  return new Request('http://localhost/serwist/sw.js');
}

function context(path: string) {
  return { params: Promise.resolve({ path }) };
}

describe('Serwist route with Cache Components', () => {
  it('retains the existing compile and precache inputs', async () => {
    await import('./[path]/route');
    expect(mocks.factory).toHaveBeenCalledWith({
      additionalPrecacheEntries: [
        { revision: 'serwist-test-build', url: '/~offline' },
      ],
      esbuildOptions: { format: 'iife' },
      globPatterns: [
        'public/assets/pwa/**/*.{png,svg,webmanifest}',
        'public/favicon.ico',
        'public/logo.svg',
        'public/sounds/task-complete.mp3',
      ],
      swSrc: 'app/sw.ts',
      useNativeEsbuild: true,
    });
  });

  it.each([
    ['sw.js', 'application/javascript', 'classic worker'],
    ['sw.js.map', 'application/json; charset=UTF-8', '{"version":3}'],
  ])(
    'serves %s with its original body and scope headers',
    async (path, contentType, body) => {
      mocks.GET.mockResolvedValue(
        new Response(body, {
          headers: {
            'Content-Type': contentType,
            'Service-Worker-Allowed': '/',
          },
        }) as Awaited<ReturnType<SerwistRoute['GET']>>,
      );
      const { GET } = await import('./[path]/route');
      const response = await GET(request(), context(path));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
      expect(Object.fromEntries(response.headers)).toEqual({
        'content-type': contentType,
        'service-worker-allowed': '/',
      });
      expect(mocks.cacheLife).toHaveBeenCalledWith({
        expire: Infinity,
        revalidate: Infinity,
      });
    },
  );

  it.each(['', '../sw.js', 'SW.JS', 'sw.mjs', 'sw.js.map.map', 'workbox-x.js'])(
    'rejects unknown worker name %s before compilation',
    async (path) => {
      const { GET } = await import('./[path]/route');
      await expect(GET(request(), context(path))).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mocks.GET).not.toHaveBeenCalled();
      expect(mocks.cacheLife).not.toHaveBeenCalled();
    },
  );

  it('declares the complete, stable set of generated worker files', async () => {
    const { generateStaticParams } = await import('./[path]/route');
    expect(await generateStaticParams()).toEqual([
      { path: 'sw.js' },
      { path: 'sw.js.map' },
    ]);
  });

  it.each([
    [{ path: 'sw.js' }],
    [{ path: 'sw.js' }, { path: 'sw.js.map' }, { path: 'extra.js' }],
    [{ path: 'sw.js' }, { path: 'sw.js' }],
  ])('fails when generated filenames drift: %j', async (...params) => {
    mocks.generateStaticParams.mockResolvedValue(params);
    const { generateStaticParams } = await import('./[path]/route');
    await expect(generateStaticParams()).rejects.toThrow('Serwist emitted');
  });

  it('omits segment configuration incompatible with Cache Components', async () => {
    const route = await import('./[path]/route');
    for (const key of [
      'dynamic',
      'dynamicParams',
      'revalidate',
      'fetchCache',
    ]) {
      expect(route).not.toHaveProperty(key);
    }
  });

  it('caches serializable worker data in the helper, outside the HTTP handler', () => {
    const source = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        './[path]/route.ts',
      ),
      'utf8',
    );
    expect(source.match(/['"]use cache['"]/g)).toHaveLength(1);
    expect(source).toMatch(
      /async function readSerwistFile\([\s\S]*?\{\s*['"]use cache['"]/,
    );
  });

  it('delegates every development request to the package rebuild path', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('./[path]/route');
    await GET(request(), context('sw.js'));
    await GET(request(), context('sw.js'));
    expect(mocks.GET).toHaveBeenCalledTimes(2);
    expect(mocks.cacheLife).not.toHaveBeenCalled();
  });

  it('fails loudly if the package provides no generated body', async () => {
    mocks.GET.mockResolvedValue(
      new Response(null) as Awaited<ReturnType<SerwistRoute['GET']>>,
    );
    const { GET } = await import('./[path]/route');
    await expect(GET(request(), context('sw.js'))).rejects.toThrow(
      'Serwist returned no body',
    );
  });
});
