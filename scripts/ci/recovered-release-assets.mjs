import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { loadReleaseRecoveryQualifications } from './release-recovery-evidence.mjs';
import { imageRevisions } from './resolve-server-image.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const IMAGE_TAG_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE_INT_PATTERN = /^[1-9][0-9]*$/;
const MAX_ASSET_BYTES = 2_000_000;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024;
const MAX_TAR_ENTRIES = 64;
const MAX_MANIFEST_BYTES = 4096;
const RELEASE_JSON_KEYS = new Set([
  'image',
  'releaseTag',
  'revision',
  'schemaVersion',
]);

function fail(message) {
  throw new Error(message);
}

function assertToken(value, pattern, message) {
  if (!pattern.test(String(value ?? ''))) {
    fail(message);
  }
}

function sha256Digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertBytes(bytes, expectedSize, expectedDigest, label) {
  if (!Buffer.isBuffer(bytes)) {
    fail(`Recovered ${label} asset bytes are missing.`);
  }
  if (bytes.length > MAX_ASSET_BYTES || String(bytes.length) !== expectedSize) {
    fail(`Recovered ${label} asset size does not match the captured identity.`);
  }
  if (sha256Digest(bytes) !== expectedDigest) {
    fail(
      `Recovered ${label} asset digest does not match the captured identity.`,
    );
  }
}

export function readArchiveChecksum(checksumBytes, archiveBytes) {
  if (!Buffer.isBuffer(checksumBytes) || !Buffer.isBuffer(archiveBytes)) {
    fail('Recovered checksum verification is missing asset bytes.');
  }
  const text = checksumBytes.toString('utf8');
  const match = text.match(/^([0-9a-f]{64}) [ *]([^\r\n]+)\n?$/);
  if (!match || match[2] !== 'genfeed-selfhosted.tar.gz') {
    fail(
      'Recovered checksum asset is not a single sha256sum record for genfeed-selfhosted.tar.gz.',
    );
  }
  const archiveDigest = createHash('sha256').update(archiveBytes).digest('hex');
  if (match[1] !== archiveDigest) {
    fail('Recovered checksum does not match the archive bytes.');
  }
  return match[1];
}

function inflateArchive(bytes, maxUncompressedBytes) {
  try {
    const inflated = gunzipSync(bytes, {
      maxOutputLength: maxUncompressedBytes,
    });
    if (inflated.length > maxUncompressedBytes) {
      fail('Recovered archive exceeds the safe uncompressed size.');
    }
    return inflated;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Recovered archive exceeds the safe uncompressed size.'
    ) {
      throw error;
    }
    const code =
      error && typeof error === 'object' && 'code' in error ? error.code : '';
    const message = error instanceof Error ? error.message : '';
    if (
      code === 'ERR_BUFFER_TOO_LARGE' ||
      /maxOutputLength|too large/i.test(message)
    ) {
      fail('Recovered archive exceeds the safe uncompressed size.');
    }
    fail('Recovered archive is not a gzip tar.');
  }
}

function readCString(bytes) {
  const end = bytes.indexOf(0);
  return (end === -1 ? bytes : bytes.subarray(0, end)).toString('utf8');
}

function parseOctal(bytes) {
  const text = bytes.toString('utf8').replace(/\0.*/, '').trim();
  if (!/^[0-7]+$/.test(text)) {
    fail('Recovered archive has a corrupt tar header.');
  }
  return Number.parseInt(text, 8);
}

function headerChecksum(header) {
  let sum = 0;
  for (let index = 0; index < header.length; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : header[index];
  }
  return sum;
}

function isSupportedTarMagic(header) {
  // GNU `tar -czf` writes "ustar " (ustar plus a space). POSIX ustar writes
  // "ustar\0". Both are inert headers. Pax and GNU long-name extensions are
  // rejected later by the typeflag check.
  const magic = header.subarray(257, 263).toString('latin1');
  return magic === 'ustar\0' || magic === 'ustar ';
}

function assertBundlePath(name, releaseTag, isDirectory) {
  const root = `genfeed-selfhosted-${releaseTag}`;
  let pathName = name;
  if (isDirectory && pathName.endsWith('/') && !pathName.endsWith('//')) {
    pathName = pathName.slice(0, -1);
  }
  const parts = pathName.split('/');
  if (
    pathName.length === 0 ||
    name.includes('\0') ||
    name.includes('\\') ||
    pathName.startsWith('/') ||
    parts.some((part) => part === '' || part === '..' || part === '.')
  ) {
    fail('Recovered archive contains an unsafe path.');
  }
  if (pathName !== root && !pathName.startsWith(`${root}/`)) {
    fail('Recovered archive escaped the versioned bundle directory.');
  }
}

function readTarEntries(bytes, releaseTag) {
  const entries = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      break;
    }
    if (headerChecksum(header) !== parseOctal(header.subarray(148, 156))) {
      fail('Recovered archive has a corrupt tar header.');
    }
    if (!isSupportedTarMagic(header)) {
      fail('Recovered archive is not a ustar archive.');
    }
    const prefix = readCString(header.subarray(345, 500));
    const name = readCString(header.subarray(0, 100));
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseOctal(header.subarray(124, 136));
    const typeflag = header[156];
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + size > bytes.length
    ) {
      fail('Recovered archive has a corrupt tar entry.');
    }
    const data = bytes.subarray(offset, offset + size);
    const padded = Math.ceil(size / 512) * 512;
    if (offset + padded > bytes.length) {
      fail('Recovered archive has a corrupt tar entry.');
    }
    const padding = bytes.subarray(offset + size, offset + padded);
    for (const byte of padding) {
      if (byte !== 0) {
        fail('Recovered archive has a corrupt tar entry.');
      }
    }
    offset += padded;
    const isFile = typeflag === 0 || typeflag === 48;
    const isDirectory = typeflag === 53;
    if (!isFile && !isDirectory) {
      fail('Recovered archive contains an unsupported tar entry.');
    }
    if (isDirectory && size !== 0) {
      fail('Recovered archive contains a non-empty directory entry.');
    }
    assertBundlePath(fullName, releaseTag, isDirectory);
    entries.push({ data, isFile, name: fullName });
    if (entries.length > MAX_TAR_ENTRIES) {
      fail('Recovered archive contains too many entries.');
    }
  }
  return entries;
}

export function readBundleReleaseManifest(
  archiveBytes,
  {
    imageTag,
    maxUncompressedBytes = MAX_UNCOMPRESSED_BYTES,
    releaseSha,
    releaseTag,
    repository,
  },
) {
  assertToken(
    releaseTag,
    TAG_PATTERN,
    'Recovered archive tag is not a stable release tag.',
  );
  assertToken(
    imageTag,
    IMAGE_TAG_PATTERN,
    'Recovered archive image tag is not a stable version.',
  );
  assertToken(
    releaseSha,
    SHA_PATTERN,
    'Recovered archive revision is not an exact SHA.',
  );
  assertToken(
    repository,
    REPOSITORY_PATTERN,
    'Recovered archive repository is not an owner/repository pair.',
  );
  if (!Buffer.isBuffer(archiveBytes)) {
    fail('Recovered archive bytes are missing.');
  }
  const entries = readTarEntries(
    inflateArchive(archiveBytes, maxUncompressedBytes),
    releaseTag,
  );
  const manifestName = `genfeed-selfhosted-${releaseTag}/release.json`;
  const manifests = entries.filter((entry) => entry.name === manifestName);
  if (manifests.length !== 1 || !manifests[0].isFile) {
    fail('Recovered archive is missing release.json.');
  }
  if (manifests[0].data.length > MAX_MANIFEST_BYTES) {
    fail('Recovered release.json exceeds the safe manifest size.');
  }
  let manifest;
  try {
    manifest = JSON.parse(manifests[0].data.toString('utf8'));
  } catch {
    fail('Recovered release.json is not JSON.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('Recovered release.json is not an object.');
  }
  const unexpected = Object.keys(manifest).filter(
    (key) => !RELEASE_JSON_KEYS.has(key),
  );
  if (unexpected.length > 0) {
    fail('Recovered release.json contains an unexpected field.');
  }
  if (manifest.schemaVersion !== 1 || manifest.releaseTag !== releaseTag) {
    fail('Recovered release.json does not match the historical release tag.');
  }
  if (manifest.image !== `ghcr.io/${repository}:${imageTag}`) {
    fail(
      'Recovered release.json does not match the historical Community image.',
    );
  }
  if (Object.hasOwn(manifest, 'revision') && manifest.revision !== releaseSha) {
    fail('Recovered release.json revision does not match the historical SHA.');
  }
  return {
    image: manifest.image,
    releaseTag: manifest.releaseTag,
    revision: Object.hasOwn(manifest, 'revision') ? manifest.revision : null,
  };
}

function imageLabelValues(value, label) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const values = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      ['Labels', 'labels'].includes(key) &&
      child &&
      typeof child === 'object' &&
      typeof child[label] === 'string'
    ) {
      values.push(child[label]);
    } else {
      values.push(...imageLabelValues(child, label));
    }
  }
  return values;
}

export function assertCommunityImage({
  imageConfig,
  imageTag,
  manifestDigest,
  releaseSha,
}) {
  assertToken(
    manifestDigest,
    DIGEST_PATTERN,
    'Community image inspection did not return an immutable sha256 digest.',
  );
  assertToken(
    imageTag,
    IMAGE_TAG_PATTERN,
    'Community image tag is not a stable version.',
  );
  assertToken(
    releaseSha,
    SHA_PATTERN,
    'Community image revision is not an exact SHA.',
  );
  const revisions = [...new Set(imageRevisions(imageConfig))];
  if (revisions.length !== 1 || revisions[0] !== releaseSha) {
    fail('Community image revision does not match the historical release SHA.');
  }
  const versions = [
    ...new Set(
      imageLabelValues(imageConfig, 'org.opencontainers.image.version'),
    ),
  ];
  if (versions.length !== 1 || versions[0] !== imageTag) {
    fail('Community image version does not match the historical release tag.');
  }
  return manifestDigest;
}

function findAsset(release, name) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const matches = assets.filter((asset) => asset?.name === name);
  if (matches.length !== 1) {
    fail(`Recovered draft must contain exactly one ${name} asset.`);
  }
  return matches[0];
}

function assertAssetFrozen(release, name, id, digest, size) {
  const asset = findAsset(release, name);
  if (
    String(asset.id) !== id ||
    asset.digest !== digest ||
    String(asset.size) !== size ||
    asset.state !== 'uploaded'
  ) {
    fail(`Recovered draft asset ${name} does not match the captured identity.`);
  }
}

function assertDraftFrozen(release, expected) {
  const bodyHash = createHash('sha256')
    .update(String(release?.body ?? ''))
    .digest('hex');
  if (
    String(release?.id ?? '') !== expected.draftId ||
    release?.name !== expected.draftTitle ||
    release?.name !== expected.releaseTag ||
    release?.tag_name !== expected.releaseTag ||
    release?.draft !== true ||
    release?.published_at != null ||
    release?.target_commitish !== expected.releaseSha ||
    bodyHash !== expected.draftBodySha256
  ) {
    fail('Recovered draft identity, title, target, or notes changed.');
  }
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (assets.length !== 3) {
    fail(
      'Recovered draft must contain exactly the changelog and two install assets.',
    );
  }
  assertAssetFrozen(
    release,
    'CHANGELOG.md',
    expected.changelogAssetId,
    expected.changelogAssetDigest,
    expected.changelogAssetSize,
  );
  assertAssetFrozen(
    release,
    'genfeed-selfhosted.tar.gz',
    expected.archiveAssetId,
    expected.archiveAssetDigest,
    expected.archiveAssetSize,
  );
  assertAssetFrozen(
    release,
    'genfeed-selfhosted.tar.gz.sha256',
    expected.checksumAssetId,
    expected.checksumAssetDigest,
    expected.checksumAssetSize,
  );
}

function assertReviewedAssetTimestamps(release, expected) {
  const records = loadReleaseRecoveryQualifications().filter(
    (record) =>
      record.repository === expected.repository &&
      record.releaseTag === expected.releaseTag &&
      record.releaseSha === expected.releaseSha &&
      record.draftId === expected.draftId,
  );
  if (records.length !== 1)
    fail(
      'Recovered assets require exactly one reviewed release qualification.',
    );
  for (const qualified of records[0].assets) {
    const asset = findAsset(release, qualified.name);
    if (
      asset.created_at !== qualified.created_at ||
      asset.updated_at !== qualified.updated_at
    )
      fail(
        `Recovered draft asset ${qualified.name} timestamps do not match the reviewed identity.`,
      );
  }
}

export function assertRecoveredAssetIdentity(expected) {
  for (const [label, value, pattern] of [
    ['release tag', expected?.releaseTag, TAG_PATTERN],
    ['image tag', expected?.imageTag, IMAGE_TAG_PATTERN],
    ['release SHA', expected?.releaseSha, SHA_PATTERN],
    ['repository', expected?.repository, REPOSITORY_PATTERN],
    ['draft id', expected?.draftId, POSITIVE_INT_PATTERN],
    ['draft title', expected?.draftTitle, TAG_PATTERN],
    ['draft body', expected?.draftBodySha256, /^[0-9a-f]{64}$/],
    ['changelog id', expected?.changelogAssetId, POSITIVE_INT_PATTERN],
    ['changelog digest', expected?.changelogAssetDigest, DIGEST_PATTERN],
    ['changelog size', expected?.changelogAssetSize, POSITIVE_INT_PATTERN],
    ['archive id', expected?.archiveAssetId, POSITIVE_INT_PATTERN],
    ['archive digest', expected?.archiveAssetDigest, DIGEST_PATTERN],
    ['archive size', expected?.archiveAssetSize, POSITIVE_INT_PATTERN],
    ['checksum id', expected?.checksumAssetId, POSITIVE_INT_PATTERN],
    ['checksum digest', expected?.checksumAssetDigest, DIGEST_PATTERN],
    ['checksum size', expected?.checksumAssetSize, POSITIVE_INT_PATTERN],
    ['image digest', expected?.imageDigest, DIGEST_PATTERN],
  ]) {
    assertToken(
      value,
      pattern,
      `Recovered asset verification has an invalid ${label}.`,
    );
  }
  if (expected.draftTitle !== expected.releaseTag) {
    fail('Recovered draft title does not match the release tag.');
  }
  if (expected.imageTag !== expected.releaseTag.slice(1)) {
    fail('Recovered image tag does not match the release tag.');
  }
  for (const size of [
    expected.changelogAssetSize,
    expected.archiveAssetSize,
    expected.checksumAssetSize,
  ]) {
    if (Number(size) > MAX_ASSET_BYTES) {
      fail('Recovered asset exceeds the safe download size.');
    }
  }
}

export function verifyRecoveredReleaseAssets({
  archiveBytes,
  changelogBytes,
  checksumBytes,
  expected,
  imageConfig,
  manifestDigest,
  release,
  releaseAfter,
  remoteTagPresent,
}) {
  assertRecoveredAssetIdentity(expected);
  if (remoteTagPresent !== false) {
    fail(
      `Recovery refuses ${expected.releaseTag} because its Git tag already exists.`,
    );
  }

  assertDraftFrozen(release, expected);
  assertDraftFrozen(releaseAfter, expected);
  assertReviewedAssetTimestamps(release, expected);
  assertReviewedAssetTimestamps(releaseAfter, expected);
  assertBytes(
    changelogBytes,
    expected.changelogAssetSize,
    expected.changelogAssetDigest,
    'changelog',
  );
  assertBytes(
    archiveBytes,
    expected.archiveAssetSize,
    expected.archiveAssetDigest,
    'archive',
  );
  assertBytes(
    checksumBytes,
    expected.checksumAssetSize,
    expected.checksumAssetDigest,
    'checksum',
  );
  readArchiveChecksum(checksumBytes, archiveBytes);
  readBundleReleaseManifest(archiveBytes, {
    imageTag: expected.imageTag,
    releaseSha: expected.releaseSha,
    releaseTag: expected.releaseTag,
    repository: expected.repository,
  });
  if (manifestDigest !== expected.imageDigest) {
    fail(
      'Community image tag does not match the reviewed historical image digest.',
    );
  }
  const imageDigest = assertCommunityImage({
    imageConfig,
    imageTag: expected.imageTag,
    manifestDigest: expected.imageDigest,
    releaseSha: expected.releaseSha,
  });
  return {
    archiveAssetDigest: expected.archiveAssetDigest,
    archiveAssetId: expected.archiveAssetId,
    archiveAssetSize: expected.archiveAssetSize,
    checksumAssetDigest: expected.checksumAssetDigest,
    checksumAssetId: expected.checksumAssetId,
    checksumAssetSize: expected.checksumAssetSize,
    imageDigest,
  };
}

function runCommand(spawn, command, args, { encoding, env }) {
  const result = spawn(command, args, {
    encoding,
    env,
    maxBuffer: MAX_ASSET_BYTES,
    timeout: 120_000,
  });
  return result;
}

function fetchDraftRelease({ draftId, env, repository, spawn }) {
  const result = runCommand(
    spawn,
    'gh',
    ['api', `repos/${repository}/releases/${draftId}`],
    { encoding: 'utf8', env },
  );
  if (result.status !== 0) {
    fail('Could not revalidate the historical draft release.');
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail('Could not revalidate the historical draft release.');
  }
}

function downloadAsset({ assetId, env, repository, spawn }) {
  const result = runCommand(
    spawn,
    'gh',
    [
      'api',
      '--allow-escape-sequences',
      '--method',
      'GET',
      '-H',
      'Accept: application/octet-stream',
      `repos/${repository}/releases/assets/${assetId}`,
    ],
    { env },
  );
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(`Could not download historical release asset ${assetId}.`);
  }
  return result.stdout;
}

function inspectImage(reference, format, { env, spawn }) {
  const result = runCommand(
    spawn,
    'docker',
    ['buildx', 'imagetools', 'inspect', reference, '--format', format],
    { encoding: 'utf8', env },
  );
  if (result.status !== 0) {
    fail('Anonymous Community image inspection failed.');
  }
  try {
    return JSON.parse(String(result.stdout ?? '').trim());
  } catch {
    fail('Anonymous Community image inspection returned unreadable metadata.');
  }
}

function releaseTagExists({ env, repository, releaseTag, spawn }) {
  const result = runCommand(
    spawn,
    'gh',
    ['api', `repos/${repository}/git/ref/tags/${releaseTag}`],
    { encoding: 'utf8', env },
  );
  if (result.status === 0) {
    return true;
  }
  const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (/Not Found|\b404\b/.test(detail)) {
    return false;
  }
  fail('Could not verify whether the release tag already exists.');
}

function expectedFromEnv(env) {
  return {
    archiveAssetDigest: env.ARCHIVE_ASSET_DIGEST ?? '',
    archiveAssetId: env.ARCHIVE_ASSET_ID ?? '',
    archiveAssetSize: env.ARCHIVE_ASSET_SIZE ?? '',
    changelogAssetDigest: env.CHANGELOG_ASSET_DIGEST ?? '',
    changelogAssetId: env.CHANGELOG_ASSET_ID ?? '',
    changelogAssetSize: env.CHANGELOG_ASSET_SIZE ?? '',
    checksumAssetDigest: env.CHECKSUM_ASSET_DIGEST ?? '',
    checksumAssetId: env.CHECKSUM_ASSET_ID ?? '',
    checksumAssetSize: env.CHECKSUM_ASSET_SIZE ?? '',
    draftBodySha256: env.DRAFT_BODY_SHA256 ?? '',
    draftId: env.DRAFT_ID ?? '',
    draftTitle: env.DRAFT_TITLE ?? '',
    imageDigest: env.EXPECTED_IMAGE_DIGEST ?? '',
    imageTag: env.IMAGE_TAG ?? '',
    releaseSha: env.RELEASE_SHA ?? '',
    releaseTag: env.RELEASE_TAG ?? '',
    repository: env.GITHUB_REPOSITORY ?? '',
  };
}

export function runRecoveredReleaseAssetsCli({
  appendFile = appendFileSync,
  env = process.env,
  error = console.error,
  spawn = spawnSync,
} = {}) {
  try {
    assertToken(
      env.RELEASE_CONTROLLER_SHA,
      SHA_PATTERN,
      'Recovered asset verification requires the current release controller SHA.',
    );
    if (
      env.GITHUB_ACTIONS === 'true' &&
      env.GITHUB_SHA !== env.RELEASE_CONTROLLER_SHA
    ) {
      fail(
        'Recovered asset verification must run from the current release controller checkout.',
      );
    }
    const expected = expectedFromEnv(env);
    assertRecoveredAssetIdentity(expected);
    const release = fetchDraftRelease({
      draftId: expected.draftId,
      env,
      repository: expected.repository,
      spawn,
    });
    const tagExists = releaseTagExists({
      env,
      releaseTag: expected.releaseTag,
      repository: expected.repository,
      spawn,
    });
    const changelogBytes = downloadAsset({
      assetId: expected.changelogAssetId,
      env,
      repository: expected.repository,
      spawn,
    });
    const archiveBytes = downloadAsset({
      assetId: expected.archiveAssetId,
      env,
      repository: expected.repository,
      spawn,
    });
    const checksumBytes = downloadAsset({
      assetId: expected.checksumAssetId,
      env,
      repository: expected.repository,
      spawn,
    });
    const imageReference = `ghcr.io/${expected.repository}:${expected.imageTag}`;
    const manifestDigest = inspectImage(
      imageReference,
      '{{json .Manifest.Digest}}',
      { env, spawn },
    );
    assertToken(
      manifestDigest,
      DIGEST_PATTERN,
      'Community image inspection did not return an immutable sha256 digest.',
    );
    if (manifestDigest !== expected.imageDigest) {
      fail(
        'Community image tag does not match the reviewed historical image digest.',
      );
    }
    const imageConfig = inspectImage(
      `ghcr.io/${expected.repository}@${expected.imageDigest}`,
      '{{json .Image}}',
      { env, spawn },
    );
    const releaseAfter = fetchDraftRelease({
      draftId: expected.draftId,
      env,
      repository: expected.repository,
      spawn,
    });
    const tagExistsAfter = releaseTagExists({
      env,
      releaseTag: expected.releaseTag,
      repository: expected.repository,
      spawn,
    });
    const verified = verifyRecoveredReleaseAssets({
      archiveBytes,
      changelogBytes,
      checksumBytes,
      expected,
      imageConfig,
      manifestDigest,
      release,
      releaseAfter,
      remoteTagPresent: tagExists || tagExistsAfter,
    });
    appendFile(
      env.GITHUB_OUTPUT,
      [
        `archive_asset_digest=${verified.archiveAssetDigest}`,
        `archive_asset_id=${verified.archiveAssetId}`,
        `archive_asset_size=${verified.archiveAssetSize}`,
        `checksum_asset_digest=${verified.checksumAssetDigest}`,
        `checksum_asset_id=${verified.checksumAssetId}`,
        `checksum_asset_size=${verified.checksumAssetSize}`,
        `image_digest=${verified.imageDigest}`,
        '',
      ].join('\n'),
    );
    return verified;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`::error::${message}`);
    process.exitCode = 1;
    return null;
  }
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href;

if (isDirectInvocation) {
  runRecoveredReleaseAssetsCli();
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}
