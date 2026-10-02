import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function imageRevisions(value) {
  if (!value || typeof value !== 'object') return [];
  const revisions = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      ['Labels', 'labels'].includes(key) &&
      child &&
      typeof child === 'object'
    ) {
      const revision = child['org.opencontainers.image.revision'];
      if (typeof revision === 'string') revisions.push(revision);
    } else {
      revisions.push(...imageRevisions(child));
    }
  }
  return revisions;
}

export function resolveServerImage({ repository, sha, execute }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error('Server image source must be an exact commit SHA.');
  }
  if (
    !/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+\/server$/.test(repository ?? '')
  ) {
    throw new Error(
      'Server image repository must be the canonical GHCR server path.',
    );
  }
  const result = execute([
    'buildx',
    'imagetools',
    'inspect',
    `${repository}:${sha}`,
    '--format',
    '{{json .Manifest.Digest}}',
  ]);
  if (result.status !== 0) {
    // Auth/network failures must not be mistaken for a missing image and cause
    // an existing immutable SHA tag to be rebuilt or overwritten.
    if (
      (/manifest unknown|no such manifest/i.test(result.stderr ?? '') ||
        (result.stderr ?? '').includes(`${repository}:${sha}: not found`)) &&
      !/unauthori[sz]ed|denied|timeout/i.test(result.stderr ?? '')
    ) {
      return { exists: false, digest: '' };
    }
    throw new Error('Could not inspect the server image registry.');
  }
  const digest = JSON.parse(result.stdout);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) {
    throw new Error('Server image registry returned an invalid digest.');
  }
  const config = execute([
    'buildx',
    'imagetools',
    'inspect',
    `${repository}@${digest}`,
    '--format',
    '{{json .Image}}',
  ]);
  if (config.status !== 0)
    throw new Error('Could not inspect server image revision.');
  const revisions = imageRevisions(JSON.parse(config.stdout));
  if (!revisions.length || revisions.some((revision) => revision !== sha)) {
    throw new Error(
      'Server image revision does not match the exact source SHA.',
    );
  }
  return { exists: true, digest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = resolveServerImage({
    repository: process.env.SERVER_IMAGE_REPOSITORY,
    sha: process.env.SOURCE_SHA,
    execute: (args) =>
      spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 }),
  });
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `exists=${result.exists}\ndigest=${result.digest}\n`,
  );
}
