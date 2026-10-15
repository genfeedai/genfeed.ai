import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertSupportedNodeVersion,
  getReleaseAssetUrls,
  imageTagFromReleaseTag,
  normalizeReleaseTag,
  parseReleaseManifest,
  readPackageVersion,
  resolveReleaseTag,
  verifyReleaseChecksum,
} from '../src/index.js';

describe('release identity', () => {
  it.each([
    ['v0.5.0', 'v0.5.0'],
    ['0.5.0', 'v0.5.0'],
    ['v1.2.3-rc.1', 'v1.2.3-rc.1'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeReleaseTag(input)).toBe(expected);
  });

  it('rejects non-semver release identifiers', () => {
    expect(() => normalizeReleaseTag('master')).toThrow('Expected vX.Y.Z');
  });

  it('maps a GitHub release tag to the exact GHCR tag', () => {
    expect(imageTagFromReleaseTag('v0.5.0')).toBe('0.5.0');
  });

  it('builds archive and checksum URLs for an exact release', () => {
    expect(getReleaseAssetUrls('v0.5.0', 'https://downloads.example')).toEqual({
      archive: 'https://downloads.example/v0.5.0/genfeed-selfhosted.tar.gz',
      checksum:
        'https://downloads.example/v0.5.0/genfeed-selfhosted.tar.gz.sha256',
    });
  });

  it('resolves the latest public GitHub release', async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ tag_name: 'v0.5.0' }), { status: 200 });

    await expect(
      resolveReleaseTag(undefined, fetchImplementation),
    ).resolves.toBe('v0.5.0');
  });
});

describe('release bundle integrity', () => {
  it('accepts a manifest only when release and image versions align', () => {
    const content = JSON.stringify({
      image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
      releaseTag: 'v0.5.0',
      schemaVersion: 1,
    });

    expect(parseReleaseManifest(content, 'v0.5.0')).toEqual({
      image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
      releaseTag: 'v0.5.0',
      schemaVersion: 1,
    });
    expect(() => parseReleaseManifest(content, 'v0.5.1')).toThrow(
      'does not match',
    );
  });

  it('verifies the release archive checksum', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genfeed-create-test-'));
    const archivePath = join(directory, 'genfeed-selfhosted.tar.gz');
    const checksumPath = `${archivePath}.sha256`;
    const archive = 'release bundle fixture';
    const checksum = createHash('sha256').update(archive).digest('hex');

    await writeFile(archivePath, archive);
    await writeFile(checksumPath, `${checksum}  genfeed-selfhosted.tar.gz\n`);

    await expect(
      verifyReleaseChecksum(archivePath, checksumPath),
    ).resolves.toBeUndefined();
  });
});

describe('package metadata', () => {
  it('reports the version from package.json instead of a source constant', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'genfeed-create-version-'));
    const packageJsonUrl = pathToFileURL(join(directory, 'package.json'));
    await writeFile(packageJsonUrl, JSON.stringify({ version: '9.8.7' }));

    expect(readPackageVersion(packageJsonUrl)).toBe('9.8.7');
  });
});

describe('assertSupportedNodeVersion', () => {
  it.each(['24.0.0', '24.13.1'])('accepts Node %s', (version) => {
    expect(() => assertSupportedNodeVersion(version)).not.toThrow();
  });

  it.each(['20.19.0', '22.12.0', '23.9.0', '25.0.0', 'unknown'])(
    'rejects Node %s with a clear message',
    (version) => {
      expect(() => assertSupportedNodeVersion(version)).toThrow(
        `Node.js 24 is required (supported range: >=24 <25); found ${version}.`,
      );
    },
  );

  it('matches the engines range declared in package.json', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { engines: { node: string } };

    expect(manifest.engines.node).toBe('>=24 <25');
  });
});
