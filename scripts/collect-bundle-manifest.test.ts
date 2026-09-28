import { describe, expect, it } from 'vitest';

import {
  parseClientReferenceManifest,
  toRoute,
} from './collect-bundle-manifest';

describe('toRoute', () => {
  it('drops the page suffix and route groups, which never reach the URL', () => {
    expect(toRoute('/(public)/about/page')).toBe('/about');
    expect(toRoute('/(content)/articles/[slug]/page')).toBe('/articles/[slug]');
    expect(toRoute('/(public)/(home)/page')).toBe('/');
    expect(toRoute('/api/health/route')).toBe('/api/health');
  });
});

describe('parseClientReferenceManifest', () => {
  it('reads every segment the page renders, including the root boundaries', () => {
    const source = `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/(public)/about/page"] = ${JSON.stringify({
      clientModules: {},
      entryJSFiles: {
        '[project]/apps/website/app/(public)/about/page': [
          'static/chunks/shared.js',
          'static/chunks/about.js',
        ],
        '[project]/apps/website/app/global-error': [
          'static/chunks/shared.js',
          'static/chunks/global-error.js',
        ],
        '[project]/apps/website/app/layout': ['static/chunks/shared.js'],
        '[project]/apps/website/app/not-found': ['static/chunks/not-found.js'],
      },
    })};`;

    expect(parseClientReferenceManifest(source)).toEqual({
      chunks: [
        'static/chunks/shared.js',
        'static/chunks/about.js',
        'static/chunks/global-error.js',
        'static/chunks/not-found.js',
      ],
      entry: '/(public)/about/page',
    });
  });

  it('returns null for a file that assigns no manifest', () => {
    expect(parseClientReferenceManifest('export {};')).toBeNull();
  });
});
