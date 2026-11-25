import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

interface RouteManifest {
  bytes: number;
  route: string;
}

interface RouteManifestSize {
  findOversizedManifests(
    manifests: RouteManifest[],
    limitBytes: number,
  ): RouteManifest[];
  listRouteManifests(appServerDirectory: string): RouteManifest[];
}

const require = createRequire(import.meta.url);
const { findOversizedManifests, listRouteManifests } =
  require('../../scripts/route-manifest-size.cjs') as RouteManifestSize;

describe('route client-reference manifest size', () => {
  let root = '';

  const writeManifest = (route: string, bytes: number): void => {
    const directory = path.join(root, route);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'page_client-reference-manifest.js'),
      'x'.repeat(bytes),
    );
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-manifests-'));
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  it('lists each route manifest, largest first, and skips other files', () => {
    writeManifest('(protected)/[orgSlug]/library', 300);
    writeManifest('(public)/sign-in', 40);
    fs.writeFileSync(path.join(root, 'index.html'), 'x'.repeat(1000));

    expect(listRouteManifests(root)).toEqual([
      { bytes: 300, route: '/(protected)/[orgSlug]/library' },
      { bytes: 40, route: '/(public)/sign-in' },
    ]);
  });

  it('names every route over the limit and none at or under it', () => {
    writeManifest('big', 600);
    writeManifest('edge', 500);
    writeManifest('small', 10);

    const oversized = findOversizedManifests(listRouteManifests(root), 500);

    expect(oversized).toEqual([{ bytes: 600, route: '/big' }]);
  });

  it('returns nothing when the build output is missing', () => {
    expect(listRouteManifests(path.join(root, 'missing'))).toEqual([]);
  });
});
