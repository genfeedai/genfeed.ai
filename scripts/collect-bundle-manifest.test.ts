import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

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

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function collectFixture(includeChunks: boolean, missing = false) {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'bundle-manifest-evidence-'),
  );
  temporaryDirectories.push(directory);
  const dist = path.join(directory, 'dist');
  const files = {
    'static/chunks/root.js': 'window.root = true;',
    'static/chunks/shared.js': 'window.shared = "shared between routes";',
    'static/chunks/first.js': 'window.first = true;',
    'static/chunks/second.js': 'window.second = true;',
  };
  mkdirSync(path.join(dist, 'static/chunks'), { recursive: true });
  for (const [filename, content] of Object.entries(files))
    writeFileSync(path.join(dist, filename), content);
  writeFileSync(
    path.join(dist, 'build-manifest.json'),
    JSON.stringify({
      pages: {},
      rootMainFiles: ['static/chunks/root.js'],
    }),
  );
  for (const route of ['first', 'second']) {
    const folder = path.join(dist, 'server/app', route);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, 'page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST["/${route}/page"] = ${JSON.stringify({
        entryJSFiles: {
          layout: ['static/chunks/shared.js'],
          page: [
            'static/chunks/shared.js',
            `static/chunks/${route}.js`,
            ...(missing ? ['static/chunks/missing.js'] : []),
          ],
        },
      })};`,
    );
  }
  const out = path.join(directory, 'manifest.json');
  const result = spawnSync(
    'bun',
    [
      fileURLToPath(new URL('./collect-bundle-manifest.ts', import.meta.url)),
      '--app',
      'app',
      '--dist',
      dist,
      '--out',
      out,
      ...(includeChunks ? ['--include-chunks'] : []),
    ],
    { encoding: 'utf8' },
  );
  return { result, out, files };
}

describe('initial chunk evidence', () => {
  it('preserves the default manifest shape and accurate gzip totals', () => {
    const { result, out, files } = collectFixture(false);
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    expect(Object.keys(manifest).sort()).toEqual([
      'app',
      'generatedAt',
      'routes',
      'sharedGzipBytes',
    ]);
    expect(manifest.sharedGzipBytes).toBe(
      gzipSync(files['static/chunks/root.js']).byteLength,
    );
    expect(manifest.routes).toEqual(
      ['first', 'second'].map((route) => ({
        route: `/${route}`,
        chunkCount: 3,
        firstLoadGzipBytes: Object.entries(files)
          .filter(
            ([file]) =>
              !file.endsWith(`${route === 'first' ? 'second' : 'first'}.js`),
          )
          .reduce((sum, [, content]) => sum + gzipSync(content).byteLength, 0),
      })),
    );
  });

  it('maps actual emitted filenames and counts shared gzip assets once in the opt-in table', () => {
    const { result, out, files } = collectFixture(true);
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    expect(manifest.initialJavaScriptAssets).toEqual(
      Object.entries(files)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([filename, content]) => ({
          filename,
          rawBytes: Buffer.byteLength(content),
          gzipBytes: gzipSync(content).byteLength,
        })),
    );
    expect(
      manifest.routes.map((route: { chunks: string[] }) => route.chunks),
    ).toEqual([
      [
        'static/chunks/first.js',
        'static/chunks/root.js',
        'static/chunks/shared.js',
      ],
      [
        'static/chunks/root.js',
        'static/chunks/second.js',
        'static/chunks/shared.js',
      ],
    ]);
  });

  it('rejects missing emitted files in evidence mode while preserving default missing-file handling', () => {
    const strict = collectFixture(true, true);
    expect(strict.result.status).not.toBe(0);
    expect(strict.result.stderr).toContain('missing.js');
    expect(collectFixture(false, true).result.status).toBe(0);
  });
});
