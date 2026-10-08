import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  assertCommunityImage,
  assertRecoveredAssetIdentity,
  readArchiveChecksum,
  readBundleReleaseManifest,
  runRecoveredReleaseAssetsCli,
  verifyRecoveredReleaseAssets,
} from './recovered-release-assets.mjs';

const HELPER_PATH = fileURLToPath(
  new URL('./recovered-release-assets.mjs', import.meta.url),
);
const RELEASE_SHA = '1c228e1a2bce02234a8f317d4f8f32659c2d3cb9';
const CONTROLLER_SHA = '4d2b84fc9824c80545c6fea0912f65f70e81a632';
const RELEASE_TAG = 'v0.2.3';
const IMAGE_TAG = '0.2.3';
const REPOSITORY = 'genfeedai/genfeed.ai';
const IMAGE = `ghcr.io/${REPOSITORY}:${IMAGE_TAG}`;
const QUALIFICATIONS = JSON.parse(
  readFileSync(
    new URL('./release-recovery-qualifications.json', import.meta.url),
    'utf8',
  ),
).qualifications;
const IMAGE_DIGEST = QUALIFICATIONS[0].imageDigest;
const REPLACEMENT_IMAGE_DIGEST = `sha256:${'cd'.repeat(32)}`;
const DRAFT_BODY = 'frozen release notes\n';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function digest(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function octalField(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tarHeader({ name, size, typeflag, magic = 'ustar ' }) {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, Math.min(name.length, 100), 'latin1');
  header.write(octalField(0o644, 8), 100, 'latin1');
  header.write(octalField(0, 8), 108, 'latin1');
  header.write(octalField(0, 8), 116, 'latin1');
  header.write(octalField(size, 12), 124, 'latin1');
  header.write(octalField(0, 12), 136, 'latin1');
  header.fill(0x20, 148, 156);
  header[156] = typeflag;
  header.write(magic, 257, magic.length, 'latin1');
  if (magic === 'ustar ') {
    header[263] = 0x20;
    header[264] = 0;
  } else {
    header.write('00', 263, 'latin1');
  }
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : header[index];
  }
  header.write(sum.toString(8).padStart(6, '0'), 148, 6, 'latin1');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function tarEntry(name, data, { magic = 'ustar ', typeflag = 48 } = {}) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = tarHeader({
    magic,
    name,
    size: bytes.length,
    typeflag,
  });
  const pad = (512 - (bytes.length % 512)) % 512;
  return Buffer.concat([header, bytes, Buffer.alloc(pad)]);
}

function bundleManifest({ image = IMAGE, revision } = {}) {
  const fields = [
    '"schemaVersion": 1',
    `"releaseTag": "${RELEASE_TAG}"`,
    `"image": "${image}"`,
  ];
  if (revision !== undefined) {
    fields.push(`"revision": "${revision}"`);
  }
  return `{\n  ${fields.join(',\n  ')}\n}\n`;
}

function gzipArchive(parts) {
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

function bundleArchive({
  extra = [],
  image = IMAGE,
  magic = 'ustar ',
  revision,
} = {}) {
  const root = `genfeed-selfhosted-${RELEASE_TAG}`;
  const manifest = bundleManifest({ image, revision });
  return gzipArchive([
    tarEntry(`${root}/`, '', { magic, typeflag: 53 }),
    tarEntry(`${root}/.env.example`, 'TOKEN=\n', { magic }),
    tarEntry(`${root}/release.json`, manifest, { magic }),
    ...extra,
  ]);
}

function checksumFor(archiveBytes, filename = 'genfeed-selfhosted.tar.gz') {
  return Buffer.from(`${sha256(archiveBytes)}  ${filename}\n`);
}

function asset(name, id, bytes) {
  return {
    digest: digest(bytes),
    id,
    name,
    size: bytes.length,
    state: 'uploaded',
  };
}

function qualifiedRelease() {
  const archiveBytes = bundleArchive();
  const checksumBytes = checksumFor(archiveBytes);
  const changelogBytes = Buffer.from('changelog\n');
  const bodyHash = sha256(DRAFT_BODY);
  const assets = [
    asset('CHANGELOG.md', 615847134, changelogBytes),
    asset('genfeed-selfhosted.tar.gz', 616010182, archiveBytes),
    asset('genfeed-selfhosted.tar.gz.sha256', 616010185, checksumBytes),
  ];
  for (const value of assets) {
    const qualified = QUALIFICATIONS[0].assets.find(
      (candidate) => candidate.name === value.name,
    );
    value.created_at = qualified.created_at;
    value.updated_at = qualified.updated_at;
  }
  const release = {
    assets,
    body: DRAFT_BODY,
    draft: true,
    id: 404861326,
    name: RELEASE_TAG,
    published_at: null,
    tag_name: RELEASE_TAG,
    target_commitish: RELEASE_SHA,
  };
  const expected = {
    archiveAssetDigest: assets[1].digest,
    archiveAssetId: '616010182',
    archiveAssetSize: String(archiveBytes.length),
    changelogAssetDigest: assets[0].digest,
    changelogAssetId: '615847134',
    changelogAssetSize: String(changelogBytes.length),
    checksumAssetDigest: assets[2].digest,
    checksumAssetId: '616010185',
    checksumAssetSize: String(checksumBytes.length),
    draftBodySha256: bodyHash,
    draftId: '404861326',
    draftTitle: RELEASE_TAG,
    imageDigest: IMAGE_DIGEST,
    imageTag: IMAGE_TAG,
    releaseSha: RELEASE_SHA,
    releaseTag: RELEASE_TAG,
    repository: REPOSITORY,
  };
  return {
    archiveBytes,
    changelogBytes,
    checksumBytes,
    expected,
    imageConfig: {
      config: {
        Labels: {
          'org.opencontainers.image.revision': RELEASE_SHA,
          'org.opencontainers.image.version': IMAGE_TAG,
        },
      },
    },
    release,
  };
}

function verifyQualified(overrides = {}) {
  const fixture = qualifiedRelease();
  return verifyRecoveredReleaseAssets({
    archiveBytes: fixture.archiveBytes,
    changelogBytes: fixture.changelogBytes,
    checksumBytes: fixture.checksumBytes,
    expected: fixture.expected,
    imageConfig: fixture.imageConfig,
    manifestDigest: IMAGE_DIGEST,
    release: fixture.release,
    releaseAfter: structuredClone(fixture.release),
    remoteTagPresent: false,
    ...overrides,
  });
}

test('recovered assets accept a GNU tar bundle and freeze the anonymous image', () => {
  const fixture = qualifiedRelease();
  const manifest = readBundleReleaseManifest(fixture.archiveBytes, {
    imageTag: IMAGE_TAG,
    releaseSha: RELEASE_SHA,
    releaseTag: RELEASE_TAG,
    repository: REPOSITORY,
  });
  assert.equal(manifest.image, IMAGE);
  assert.equal(manifest.releaseTag, RELEASE_TAG);
  assert.equal(manifest.revision, null);
  assert.equal(
    readArchiveChecksum(fixture.checksumBytes, fixture.archiveBytes),
    sha256(fixture.archiveBytes),
  );

  const verified = verifyQualified();
  assert.equal(verified.imageDigest, IMAGE_DIGEST);
  assert.equal(verified.archiveAssetId, '616010182');
  assert.equal(verified.checksumAssetSize, fixture.expected.checksumAssetSize);

  const posixArchive = bundleArchive({ magic: 'ustar\0' });
  const posixManifest = readBundleReleaseManifest(posixArchive, {
    imageTag: IMAGE_TAG,
    releaseSha: RELEASE_SHA,
    releaseTag: RELEASE_TAG,
    repository: REPOSITORY,
  });
  assert.equal(posixManifest.revision, null);
});

test('recovered bundle manifest keeps a matching revision and rejects drift', () => {
  const matching = bundleArchive({ revision: RELEASE_SHA });
  assert.equal(
    readBundleReleaseManifest(matching, {
      imageTag: IMAGE_TAG,
      releaseSha: RELEASE_SHA,
      releaseTag: RELEASE_TAG,
      repository: REPOSITORY,
    }).revision,
    RELEASE_SHA,
  );

  const wrongRevision = bundleArchive({ revision: 'a'.repeat(40) });
  assert.throws(
    () =>
      readBundleReleaseManifest(wrongRevision, {
        imageTag: IMAGE_TAG,
        releaseSha: RELEASE_SHA,
        releaseTag: RELEASE_TAG,
        repository: REPOSITORY,
      }),
    /revision does not match the historical SHA/,
  );

  const wrongImage = bundleArchive({
    image: 'ghcr.io/evil.example/genfeed.ai:0.2.3',
  });
  assert.throws(
    () =>
      readBundleReleaseManifest(wrongImage, {
        imageTag: IMAGE_TAG,
        releaseSha: RELEASE_SHA,
        releaseTag: RELEASE_TAG,
        repository: REPOSITORY,
      }),
    /does not match the historical Community image/,
  );

  const extraField = bundleManifest({ image: IMAGE }).replace(
    '"schemaVersion": 1',
    '"schemaVersion": 1,\n  "script": "id"',
  );
  const tampered = gzipArchive([
    tarEntry(`genfeed-selfhosted-${RELEASE_TAG}/`, '', { typeflag: 53 }),
    tarEntry(`genfeed-selfhosted-${RELEASE_TAG}/release.json`, extraField),
  ]);
  assert.throws(
    () =>
      readBundleReleaseManifest(tampered, {
        imageTag: IMAGE_TAG,
        releaseSha: RELEASE_SHA,
        releaseTag: RELEASE_TAG,
        repository: REPOSITORY,
      }),
    /unexpected field/,
  );
});

test('recovered archives reject path escape, links, and malformed tar', () => {
  const root = `genfeed-selfhosted-${RELEASE_TAG}`;
  const context = {
    imageTag: IMAGE_TAG,
    releaseSha: RELEASE_SHA,
    releaseTag: RELEASE_TAG,
    repository: REPOSITORY,
  };
  const cases = [
    [
      gzipArchive([
        tarEntry(`${root}/../../etc/passwd`, 'x'),
        tarEntry(`${root}/release.json`, bundleManifest()),
      ]),
      /unsafe path/,
    ],
    [
      gzipArchive([
        tarEntry(`${root}/`, '', { typeflag: 53 }),
        tarEntry(`${root}/link`, '', { typeflag: 50 }),
        tarEntry(`${root}/release.json`, bundleManifest()),
      ]),
      /unsupported tar entry/,
    ],
    [
      gzipArchive([
        tarEntry(`${root}/release.json`, '{}', { magic: 'xxxxxx' }),
      ]),
      /not a ustar archive/,
    ],
    [Buffer.from('not a gzip archive'), /not a gzip tar/],
  ];
  for (const [bytes, pattern] of cases) {
    assert.throws(() => readBundleReleaseManifest(bytes, context), pattern);
  }

  const crowded = [tarEntry(`${root}/`, '', { typeflag: 53 })];
  for (let index = 0; index < 70; index += 1) {
    crowded.push(tarEntry(`${root}/file-${index}.txt`, 'x'));
  }
  assert.throws(
    () => readBundleReleaseManifest(gzipArchive(crowded), context),
    /too many entries/,
  );
  assert.throws(
    () =>
      readBundleReleaseManifest(bundleArchive(), {
        ...context,
        maxUncompressedBytes: 32,
      }),
    /safe uncompressed size/,
  );

  const archive = bundleArchive();
  assert.throws(
    () =>
      readArchiveChecksum(
        Buffer.from(`${'a'.repeat(64)}  genfeed-selfhosted.tar.gz\n`),
        archive,
      ),
    /does not match the archive bytes/,
  );
  assert.throws(
    () =>
      readArchiveChecksum(
        Buffer.from(`${sha256(archive)}  other.tar.gz\n`),
        archive,
      ),
    /not a single sha256sum record/,
  );
  assert.equal(
    readArchiveChecksum(
      Buffer.from(`${sha256(archive)} *genfeed-selfhosted.tar.gz\n`),
      archive,
    ),
    sha256(archive),
  );
  const record = `${sha256(archive)}  genfeed-selfhosted.tar.gz\n`;
  assert.throws(
    () => readArchiveChecksum(Buffer.from(`${record}${record}`), archive),
    /not a single sha256sum record/,
  );

  const pax = gzipArchive([
    tarEntry(`${root}/`, '', { typeflag: 53 }),
    tarEntry(`${root}/pax`, '1 path=../escape\n', { typeflag: 120 }),
    tarEntry(`${root}/release.json`, bundleManifest()),
  ]);
  assert.throws(
    () => readBundleReleaseManifest(pax, context),
    /unsupported tar entry/,
  );

  const manifestBytes = Buffer.from(bundleManifest());
  const header = tarHeader({
    name: `${root}/release.json`,
    size: manifestBytes.length,
    typeflag: 48,
  });
  const padLength = (512 - (manifestBytes.length % 512)) % 512;
  assert.ok(padLength > 0);
  const dirtyPad = Buffer.alloc(padLength, 0);
  dirtyPad[0] = 0x2e;
  assert.throws(
    () =>
      readBundleReleaseManifest(
        gzipSync(
          Buffer.concat([header, manifestBytes, dirtyPad, Buffer.alloc(1024)]),
        ),
        context,
      ),
    /corrupt tar entry/,
  );
});

test('recovered image labels must match the historical tag and revision', () => {
  const fixture = qualifiedRelease();
  assert.equal(
    assertCommunityImage({
      imageConfig: fixture.imageConfig,
      imageTag: IMAGE_TAG,
      manifestDigest: IMAGE_DIGEST,
      releaseSha: RELEASE_SHA,
    }),
    IMAGE_DIGEST,
  );
  const versioned = structuredClone(fixture.imageConfig);
  versioned.config.Labels['org.opencontainers.image.version'] = RELEASE_TAG;
  assert.throws(
    () =>
      assertCommunityImage({
        imageConfig: versioned,
        imageTag: IMAGE_TAG,
        manifestDigest: IMAGE_DIGEST,
        releaseSha: RELEASE_SHA,
      }),
    /version does not match the historical release tag/,
  );
  versioned.config.Labels['org.opencontainers.image.version'] = IMAGE_TAG;
  versioned.config.Labels['org.opencontainers.image.revision'] = 'b'.repeat(40);
  assert.throws(
    () =>
      assertCommunityImage({
        imageConfig: versioned,
        imageTag: IMAGE_TAG,
        manifestDigest: IMAGE_DIGEST,
        releaseSha: RELEASE_SHA,
      }),
    /revision does not match the historical release SHA/,
  );
});

test('recovered verification fails closed when the second draft snapshot drifts', () => {
  const fixture = qualifiedRelease();
  const base = {
    archiveBytes: fixture.archiveBytes,
    changelogBytes: fixture.changelogBytes,
    checksumBytes: fixture.checksumBytes,
    expected: fixture.expected,
    imageConfig: fixture.imageConfig,
    manifestDigest: IMAGE_DIGEST,
    release: fixture.release,
    remoteTagPresent: false,
  };
  const drifted = structuredClone(fixture.release);
  drifted.assets[1].id = 616010183;
  assert.throws(
    () => verifyRecoveredReleaseAssets({ ...base, releaseAfter: drifted }),
    /does not match the captured identity/,
  );

  const renamed = structuredClone(fixture.release);
  renamed.body = 'rewritten notes\n';
  assert.throws(
    () => verifyRecoveredReleaseAssets({ ...base, releaseAfter: renamed }),
    /notes changed/,
  );
  assert.throws(
    () => verifyQualified({ remoteTagPresent: true }),
    /Recovery refuses v0\.2\.3 because its Git tag already exists/,
  );

  const oversized = {
    ...fixture.expected,
    archiveAssetSize: '2000001',
  };
  assert.throws(
    () => assertRecoveredAssetIdentity(oversized),
    /safe download size/,
  );
  assert.throws(
    () =>
      assertRecoveredAssetIdentity({
        ...fixture.expected,
        draftId: '404861326;touch /tmp/pwned',
      }),
    /invalid draft id/,
  );
});

function runCli(env, behavior) {
  const calls = [];
  const errors = [];
  const output = [];
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let exitCode;
  try {
    const result = runRecoveredReleaseAssetsCli({
      appendFile: (_target, text) => output.push(text),
      env,
      error: (message) => errors.push(message),
      spawn: (command, args, options) => {
        calls.push({ args, command });
        return behavior({ args, command, options });
      },
    });
    exitCode = process.exitCode;
    return { calls, errors, exitCode, output, result };
  } finally {
    process.exitCode = previousExitCode;
  }
}

function controllerEnv(fixture, overrides = {}) {
  return {
    ARCHIVE_ASSET_DIGEST: fixture.expected.archiveAssetDigest,
    ARCHIVE_ASSET_ID: fixture.expected.archiveAssetId,
    ARCHIVE_ASSET_SIZE: fixture.expected.archiveAssetSize,
    CHANGELOG_ASSET_DIGEST: fixture.expected.changelogAssetDigest,
    CHANGELOG_ASSET_ID: fixture.expected.changelogAssetId,
    CHANGELOG_ASSET_SIZE: fixture.expected.changelogAssetSize,
    CHECKSUM_ASSET_DIGEST: fixture.expected.checksumAssetDigest,
    CHECKSUM_ASSET_ID: fixture.expected.checksumAssetId,
    CHECKSUM_ASSET_SIZE: fixture.expected.checksumAssetSize,
    DRAFT_BODY_SHA256: fixture.expected.draftBodySha256,
    DRAFT_ID: fixture.expected.draftId,
    DRAFT_TITLE: fixture.expected.draftTitle,
    EXPECTED_IMAGE_DIGEST: fixture.expected.imageDigest,
    GITHUB_ACTIONS: 'true',
    GITHUB_OUTPUT: '/tmp/recovered-release-assets.out',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SHA: CONTROLLER_SHA,
    IMAGE_TAG,
    RELEASE_CONTROLLER_SHA: CONTROLLER_SHA,
    RELEASE_SHA,
    RELEASE_TAG,
    ...overrides,
  };
}

test('asset verification downloads frozen ids and does not execute the bundle', () => {
  const helperSource = readFileSync(HELPER_PATH, 'utf8');
  assert.doesNotMatch(helperSource, /\bexecSync\b|\bexecFileSync\b/);
  assert.doesNotMatch(helperSource, /gh release upload|npm publish/);
  assert.match(helperSource, /imageDigest: env\.EXPECTED_IMAGE_DIGEST \?\? ''/);
  assert.equal(helperSource.split('--allow-escape-sequences').length - 1, 1);

  const fixture = qualifiedRelease();
  const bytesById = {
    [fixture.expected.archiveAssetId]: fixture.archiveBytes,
    [fixture.expected.changelogAssetId]: fixture.changelogBytes,
    [fixture.expected.checksumAssetId]: fixture.checksumBytes,
  };
  const success = runCli(controllerEnv(fixture), ({ args, command }) => {
    const joined = args.join(' ');
    if (command === 'gh' && joined.includes('/releases/assets/')) {
      const id = joined.match(/assets\/(\d+)/)[1];
      return { status: 0, stderr: '', stdout: bytesById[id] };
    }
    if (command === 'gh' && joined.includes('/releases/')) {
      return { status: 0, stderr: '', stdout: JSON.stringify(fixture.release) };
    }
    if (command === 'gh' && joined.includes('/git/ref/tags/')) {
      return { status: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
    }
    if (command === 'docker') {
      if (joined.includes('{{json .Manifest.Digest}}')) {
        return { status: 0, stderr: '', stdout: `"${IMAGE_DIGEST}"\n` };
      }
      return {
        status: 0,
        stderr: '',
        stdout: `${JSON.stringify(fixture.imageConfig)}\n`,
      };
    }
    return { status: 1, stderr: `unexpected ${command}`, stdout: '' };
  });

  assert.equal(success.exitCode, undefined);
  assert.equal(success.errors.length, 0);
  assert.match(
    success.output.join(''),
    new RegExp(`image_digest=${IMAGE_DIGEST}`),
  );
  assert.deepEqual(
    [...new Set(success.calls.map((call) => call.command))].sort(),
    ['docker', 'gh'],
  );
  const assetCalls = success.calls.filter((call) =>
    call.args.join(' ').includes('/releases/assets/'),
  );
  assert.deepEqual(
    assetCalls.map((call) => call.args.at(-1)),
    [
      `repos/${REPOSITORY}/releases/assets/${fixture.expected.changelogAssetId}`,
      `repos/${REPOSITORY}/releases/assets/${fixture.expected.archiveAssetId}`,
      `repos/${REPOSITORY}/releases/assets/${fixture.expected.checksumAssetId}`,
    ],
  );
  for (const call of assetCalls) {
    assert.ok(call.args.includes('--allow-escape-sequences'));
    assert.ok(call.args.includes('Accept: application/octet-stream'));
    assert.ok(call.args.includes('GET'));
  }
  const metadataCalls = success.calls.filter(
    (call) =>
      call.command === 'gh' &&
      !call.args.join(' ').includes('/releases/assets/'),
  );
  for (const call of metadataCalls) {
    assert.equal(call.args.includes('--allow-escape-sequences'), false);
  }
  const imageRefs = success.calls
    .filter((call) => call.command === 'docker')
    .map((call) => call.args[3]);
  assert.deepEqual(imageRefs, [
    `ghcr.io/${REPOSITORY}:${IMAGE_TAG}`,
    `ghcr.io/${REPOSITORY}@${IMAGE_DIGEST}`,
  ]);

  const blocked = runCli(
    controllerEnv(fixture, { DRAFT_ID: '404861326;rm -rf /' }),
    () => {
      throw new Error('network call');
    },
  );
  assert.equal(blocked.calls.length, 0);
  assert.equal(blocked.exitCode, 1);
  assert.match(blocked.errors[0], /invalid draft id/);

  const wrongController = runCli(
    controllerEnv(fixture, {
      GITHUB_SHA: CONTROLLER_SHA,
      RELEASE_CONTROLLER_SHA: RELEASE_SHA,
    }),
    () => {
      throw new Error('network call');
    },
  );
  assert.equal(wrongController.calls.length, 0);
  assert.match(
    wrongController.errors[0],
    /current release controller checkout/,
  );

  const tagError = runCli(controllerEnv(fixture), ({ args, command }) => {
    const joined = args.join(' ');
    if (command === 'gh' && joined.includes('/releases/')) {
      return { status: 0, stderr: '', stdout: JSON.stringify(fixture.release) };
    }
    return { status: 1, stderr: 'tls handshake failed', stdout: '' };
  });
  assert.equal(tagError.exitCode, 1);
  assert.match(tagError.errors[0], /release tag already exists/);
  assert.equal(
    tagError.calls.some((call) =>
      call.args.join(' ').includes('/releases/assets/'),
    ),
    false,
  );
});

test('hostile release.json cannot choose the image or write publication outputs', () => {
  const fixture = qualifiedRelease();
  const archiveBytes = bundleArchive({
    image: 'ghcr.io/evil.example/genfeed.ai:0.2.3',
  });
  const checksumBytes = checksumFor(archiveBytes);
  const archiveAsset = asset(
    'genfeed-selfhosted.tar.gz',
    616010182,
    archiveBytes,
  );
  const checksumAsset = asset(
    'genfeed-selfhosted.tar.gz.sha256',
    616010185,
    checksumBytes,
  );
  fixture.release.assets[1] = archiveAsset;
  fixture.release.assets[2] = checksumAsset;
  fixture.expected.archiveAssetDigest = archiveAsset.digest;
  fixture.expected.archiveAssetSize = String(archiveBytes.length);
  fixture.expected.checksumAssetDigest = checksumAsset.digest;
  fixture.expected.checksumAssetSize = String(checksumBytes.length);
  const bytesById = {
    [fixture.expected.archiveAssetId]: archiveBytes,
    [fixture.expected.changelogAssetId]: fixture.changelogBytes,
    [fixture.expected.checksumAssetId]: checksumBytes,
  };

  const hostile = runCli(controllerEnv(fixture), ({ args, command }) => {
    const joined = args.join(' ');
    if (command === 'gh' && joined.includes('/releases/assets/')) {
      const id = joined.match(/assets\/(\d+)/)[1];
      return { status: 0, stderr: '', stdout: bytesById[id] };
    }
    if (command === 'gh' && joined.includes('/releases/')) {
      return { status: 0, stderr: '', stdout: JSON.stringify(fixture.release) };
    }
    if (command === 'gh' && joined.includes('/git/ref/tags/')) {
      return { status: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
    }
    if (command === 'docker') {
      if (joined.includes('{{json .Manifest.Digest}}')) {
        return { status: 0, stderr: '', stdout: `"${IMAGE_DIGEST}"\n` };
      }
      return {
        status: 0,
        stderr: '',
        stdout: `${JSON.stringify(fixture.imageConfig)}\n`,
      };
    }
    return { status: 1, stderr: `unexpected ${command}`, stdout: '' };
  });

  assert.equal(hostile.exitCode, 1);
  assert.equal(hostile.output.length, 0);
  assert.match(
    hostile.errors[0],
    /does not match the historical Community image/,
  );
  const imageRefs = hostile.calls
    .filter((call) => call.command === 'docker')
    .map((call) => call.args[3]);
  assert.deepEqual(imageRefs, [
    `ghcr.io/${REPOSITORY}:${IMAGE_TAG}`,
    `ghcr.io/${REPOSITORY}@${IMAGE_DIGEST}`,
  ]);
  assert.equal(
    imageRefs.some((reference) => reference.includes('evil.example')),
    false,
  );
});

test('recovered verification refuses a replacement digest before promotion', () => {
  const fixture = qualifiedRelease();
  assert.equal(
    fixture.imageConfig.config.Labels['org.opencontainers.image.version'],
    IMAGE_TAG,
  );
  assert.equal(
    fixture.imageConfig.config.Labels['org.opencontainers.image.revision'],
    RELEASE_SHA,
  );
  assert.throws(
    () => verifyQualified({ manifestDigest: REPLACEMENT_IMAGE_DIGEST }),
    /does not match the reviewed historical image digest/,
  );

  assert.throws(
    () =>
      assertRecoveredAssetIdentity({
        ...fixture.expected,
        imageDigest: '',
      }),
    /invalid image digest/,
  );
  assert.throws(
    () =>
      assertRecoveredAssetIdentity({
        ...fixture.expected,
        imageDigest: 'sha256:abcd',
      }),
    /invalid image digest/,
  );

  const missing = runCli(
    controllerEnv(fixture, { EXPECTED_IMAGE_DIGEST: '' }),
    () => {
      throw new Error('network call');
    },
  );
  assert.equal(missing.calls.length, 0);
  assert.equal(missing.output.length, 0);
  assert.equal(missing.exitCode, 1);
  assert.match(missing.errors[0], /invalid image digest/);

  const invalid = runCli(
    controllerEnv(fixture, { EXPECTED_IMAGE_DIGEST: 'sha256:abcd' }),
    () => {
      throw new Error('network call');
    },
  );
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.output.length, 0);
  assert.match(invalid.errors[0], /invalid image digest/);

  const bytesById = {
    [fixture.expected.archiveAssetId]: fixture.archiveBytes,
    [fixture.expected.changelogAssetId]: fixture.changelogBytes,
    [fixture.expected.checksumAssetId]: fixture.checksumBytes,
  };
  const replacement = runCli(controllerEnv(fixture), ({ args, command }) => {
    const joined = args.join(' ');
    if (command === 'gh' && joined.includes('/releases/assets/')) {
      const id = joined.match(/assets\/(\d+)/)[1];
      return { status: 0, stderr: '', stdout: bytesById[id] };
    }
    if (command === 'gh' && joined.includes('/releases/')) {
      return { status: 0, stderr: '', stdout: JSON.stringify(fixture.release) };
    }
    if (command === 'gh' && joined.includes('/git/ref/tags/')) {
      return { status: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
    }
    if (command === 'docker') {
      if (joined.includes('{{json .Manifest.Digest}}')) {
        return {
          status: 0,
          stderr: '',
          stdout: `"${REPLACEMENT_IMAGE_DIGEST}"\n`,
        };
      }
      return {
        status: 0,
        stderr: '',
        stdout: `${JSON.stringify(fixture.imageConfig)}\n`,
      };
    }
    return { status: 1, stderr: `unexpected ${command}`, stdout: '' };
  });

  assert.equal(replacement.exitCode, 1);
  assert.equal(replacement.output.length, 0);
  assert.match(
    replacement.errors[0],
    /does not match the reviewed historical image digest/,
  );
  assert.equal(
    replacement.calls.some((call) =>
      call.args.join(' ').includes('{{json .Image}}'),
    ),
    false,
  );
  assert.equal(
    replacement.calls.some((call) =>
      call.args.join(' ').includes(`@${REPLACEMENT_IMAGE_DIGEST}`),
    ),
    false,
  );
  assert.equal(
    replacement.calls.some(
      (call) => call.command !== 'docker' && call.command !== 'gh',
    ),
    false,
  );
});

test('direct invocation fails closed before any registry or release write', () => {
  const result = spawnSync(process.execPath, [HELPER_PATH], {
    encoding: 'utf8',
    env: { ...process.env, RELEASE_CONTROLLER_SHA: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /current release controller SHA/);

  const tempDir = mkdtempSync(path.join(tmpdir(), 'recovered-assets-'));
  try {
    const symlinkPath = path.join(tempDir, 'recovered-release-assets.mjs');
    symlinkSync(HELPER_PATH, symlinkPath);
    const linked = spawnSync(process.execPath, [symlinkPath], {
      encoding: 'utf8',
      env: { ...process.env, RELEASE_CONTROLLER_SHA: 'not-a-sha' },
    });
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /current release controller SHA/);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

test('recovered assets reject original or post-download timestamp drift', () => {
  for (const field of ['created_at', 'updated_at']) {
    for (const snapshot of ['release', 'releaseAfter']) {
      const fixture = qualifiedRelease(),
        changed = structuredClone(fixture.release);
      changed.assets[1][field] = '2026-10-08T13:37:31Z';
      assert.throws(
        () => verifyQualified({ [snapshot]: changed }),
        /timestamps do not match the reviewed identity/,
      );
    }
  }
});
