import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isSerwistRouteFile,
  SERWIST_ESBUILD_OPTIONS,
  SERWIST_PRECACHE_GLOB_PATTERNS,
  SERWIST_ROUTE_FILES,
} from './serwist-options';

describe('serwist compile options', () => {
  it('emits a classic IIFE worker, not ESM', () => {
    expect(SERWIST_ESBUILD_OPTIONS.format).toBe('iife');
  });

  it('does not precache the Next.js build output', () => {
    expect(
      SERWIST_PRECACHE_GLOB_PATTERNS.some((pattern) =>
        /(?:^|\/)(?:\.next|_next)\//.test(pattern),
      ),
    ).toBe(false);
    expect(
      SERWIST_PRECACHE_GLOB_PATTERNS.some((pattern) =>
        pattern.includes('static/**'),
      ),
    ).toBe(false);
  });
});

describe('service worker source', () => {
  it('does not export symbols the classic worker cannot parse', () => {
    const swPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../sw.ts',
    );
    const source = readFileSync(swPath, 'utf8');

    expect(source).not.toMatch(/^\s*export\s/m);
    expect(source).not.toMatch(/\bexport\s+\{/);
    expect(source).toContain('createServiceWorker()');
  });
});

describe('Serwist route files', () => {
  it('allows exactly the classic worker and its source map', () => {
    expect(SERWIST_ROUTE_FILES).toEqual(['sw.js', 'sw.js.map']);
    for (const file of SERWIST_ROUTE_FILES) {
      expect(isSerwistRouteFile(file)).toBe(true);
    }
  });

  it.each(['', '../sw.js', 'SW.JS', 'sw.mjs', 'sw.js.map.map', 'unknown.js'])(
    'rejects %s',
    (file) => {
      expect(isSerwistRouteFile(file)).toBe(false);
    },
  );
});
