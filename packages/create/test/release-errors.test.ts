import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getReleaseAssetUrls,
  parseReleaseManifest,
  readPackageVersion,
  resolveReleaseTag,
  verifyReleaseChecksum,
} from '../src/index';

const createdDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createFetchStub(handler: (url: string) => Response): typeof fetch {
  const stub = async (input: string | URL | Request): Promise<Response> =>
    handler(input.toString());
  return stub as typeof fetch;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

describe('getReleaseAssetUrls', () => {
  it('strips a trailing slash from the download base URL', () => {
    expect(getReleaseAssetUrls('0.5.0', 'https://downloads.example/')).toEqual({
      archive: 'https://downloads.example/v0.5.0/genfeed-selfhosted.tar.gz',
      checksum:
        'https://downloads.example/v0.5.0/genfeed-selfhosted.tar.gz.sha256',
    });
  });

  it('defaults to the GitHub release download URL', () => {
    vi.stubEnv('GENFEED_RELEASE_DOWNLOAD_BASE_URL', undefined);

    expect(getReleaseAssetUrls('v0.5.0').archive).toBe(
      'https://github.com/genfeedai/genfeed.ai/releases/download/v0.5.0/genfeed-selfhosted.tar.gz',
    );
  });

  it('prefers the download base URL from the environment', () => {
    vi.stubEnv(
      'GENFEED_RELEASE_DOWNLOAD_BASE_URL',
      'https://mirror.example/releases',
    );

    expect(getReleaseAssetUrls('v0.5.0').checksum).toBe(
      'https://mirror.example/releases/v0.5.0/genfeed-selfhosted.tar.gz.sha256',
    );
  });
});

describe('resolveReleaseTag error handling', () => {
  it('rejects when GitHub responds with an HTTP error', async () => {
    const fetchImplementation = createFetchStub(
      () => new Response('rate limited', { status: 403 }),
    );

    await expect(
      resolveReleaseTag(undefined, fetchImplementation),
    ).rejects.toThrow(
      'Could not resolve the latest Genfeed.ai release (HTTP 403).',
    );
  });

  it('rejects when the latest-release payload is not an object', async () => {
    const fetchImplementation = createFetchStub(
      () => new Response('null', { status: 200 }),
    );

    await expect(
      resolveReleaseTag(undefined, fetchImplementation),
    ).rejects.toThrow('GitHub returned invalid latest-release metadata.');
  });

  it('rejects when the latest release has no tag name', async () => {
    const fetchImplementation = createFetchStub(
      () => new Response(JSON.stringify({ tag_name: 42 }), { status: 200 }),
    );

    await expect(
      resolveReleaseTag(undefined, fetchImplementation),
    ).rejects.toThrow('GitHub latest release did not include a release tag.');
  });
});

describe('verifyReleaseChecksum error handling', () => {
  it('rejects a malformed checksum file', async () => {
    const directory = await createTemporaryDirectory('genfeed-checksum-');
    const archivePath = join(directory, 'genfeed-selfhosted.tar.gz');
    const checksumPath = `${archivePath}.sha256`;
    await writeFile(archivePath, 'archive');
    await writeFile(checksumPath, 'not-a-checksum\n');

    await expect(
      verifyReleaseChecksum(archivePath, checksumPath),
    ).rejects.toThrow('Release checksum file is malformed.');
  });

  it('rejects an archive whose checksum does not match', async () => {
    const directory = await createTemporaryDirectory('genfeed-checksum-');
    const archivePath = join(directory, 'genfeed-selfhosted.tar.gz');
    const checksumPath = `${archivePath}.sha256`;
    await writeFile(archivePath, 'archive');
    await writeFile(
      checksumPath,
      `${'a'.repeat(64)}  genfeed-selfhosted.tar.gz\n`,
    );

    await expect(
      verifyReleaseChecksum(archivePath, checksumPath),
    ).rejects.toThrow('Release checksum mismatch');
  });
});

describe('parseReleaseManifest error handling', () => {
  it('rejects manifests that are not objects', () => {
    expect(() => parseReleaseManifest('null', 'v0.5.0')).toThrow(
      'Release manifest is not an object.',
    );
  });

  it('rejects a manifest with the wrong schema version', () => {
    const content = JSON.stringify({
      image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
      releaseTag: 'v0.5.0',
      schemaVersion: 2,
    });

    expect(() => parseReleaseManifest(content, 'v0.5.0')).toThrow(
      'does not match',
    );
  });

  it('rejects a manifest pointing at an unexpected image', () => {
    const content = JSON.stringify({
      image: 'ghcr.io/attacker/genfeed.ai:0.5.0',
      releaseTag: 'v0.5.0',
      schemaVersion: 1,
    });

    expect(() => parseReleaseManifest(content, 'v0.5.0')).toThrow(
      'does not match',
    );
  });
});

describe('readPackageVersion error handling', () => {
  it('rejects a package manifest without a version string', async () => {
    const directory = await createTemporaryDirectory('genfeed-version-');
    const packageJsonUrl = pathToFileURL(join(directory, 'package.json'));
    await writeFile(packageJsonUrl, JSON.stringify({ name: 'fixture' }));

    expect(() => readPackageVersion(packageJsonUrl)).toThrow(
      'Could not read the @genfeedai/create package version.',
    );
  });
});
