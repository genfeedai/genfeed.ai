import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const privateEcrPattern =
  /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?\/[a-z0-9][a-z0-9._/-]*$/;
const packPath = '/usr/src/app/content-harness/index.cjs';
type CommandRunner = (command: string, args: string[]) => string;
interface ImageConfiguration {
  source: string;
  tag: string;
  destination: string;
  bundleUri?: string;
  bundleSha256?: string;
}

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Command diagnostics may contain private bundle locations or contents.
    throw new Error(
      `Hosted server image preparation failed during ${command}.`,
    );
  }
}

function inspect(reference: string, execute: CommandRunner): string {
  const digest: unknown = JSON.parse(
    execute('docker', [
      'buildx',
      'imagetools',
      'inspect',
      reference,
      '--format',
      '{{json .Manifest.Digest}}',
    ]),
  );
  if (typeof digest !== 'string' || !digestPattern.test(digest))
    throw new Error('Registry returned an invalid image digest.');
  return digest;
}

export function verifyBundle(contents: Uint8Array, expected: string): void {
  if (
    !/^[0-9a-f]{64}$/.test(expected) ||
    !contents.length ||
    contents.length > 5 * 1024 * 1024 ||
    createHash('sha256').update(contents).digest('hex') !== expected
  ) {
    throw new Error(
      'Content harness bundle checksum or size validation failed.',
    );
  }
}

export function prepareServerImage(
  config: ImageConfiguration,
  execute: CommandRunner = run,
): { digest: string; packages: string } {
  if (!privateEcrPattern.test(config.destination))
    throw new Error('Hosted images require a private ECR destination.');
  if (
    !/^[A-Za-z0-9._-]{1,128}$/.test(config.tag) ||
    !/^ghcr\.io\/[a-z0-9._/-]+$/.test(config.source)
  )
    throw new Error('Invalid source image reference.');
  const { bundleUri, bundleSha256 } = config;
  const hasBundle = !!bundleUri || !!bundleSha256;
  if (
    hasBundle &&
    (!config.bundleUri ||
      !/^s3:\/\/[a-z0-9][a-z0-9.-]+\/[^\s]+$/.test(config.bundleUri) ||
      !/^[0-9a-f]{64}$/.test(config.bundleSha256 ?? ''))
  ) {
    throw new Error(
      'Configure both CONTENT_HARNESS_BUNDLE_URI and CONTENT_HARNESS_BUNDLE_SHA256.',
    );
  }
  const baseDigest = inspect(`${config.source}:${config.tag}`, execute);
  if (!hasBundle) {
    const destination = `${config.destination}:${config.tag}`;
    execute('docker', [
      'buildx',
      'imagetools',
      'create',
      '--prefer-index=false',
      '-t',
      destination,
      `${config.source}@${baseDigest}`,
    ]);
    const digest = inspect(destination, execute);
    if (digest !== baseDigest)
      throw new Error('Copied server digest does not match the source.');
    return { digest, packages: '' };
  }

  if (!bundleUri || !bundleSha256)
    throw new Error('Content harness bundle configuration is missing.');
  const directory = mkdtempSync(join(tmpdir(), 'content-harness-'));
  try {
    const bundle = join(directory, 'index.cjs');
    execute('aws', ['s3', 'cp', bundleUri, bundle, '--only-show-errors']);
    verifyBundle(readFileSync(bundle), bundleSha256);
    // Only the immutable module is copied; no private source checkout, credentials,
    // build scripts or source maps enter the public checkout or build cache.
    writeFileSync(
      join(directory, 'Dockerfile'),
      `FROM ${config.source}@${baseDigest}\nCOPY --chmod=0444 index.cjs ${packPath}\n`,
    );
    const destination = `${config.destination}:harness-${baseDigest.slice(7, 31)}-${bundleSha256.slice(0, 24)}`;
    execute('docker', [
      'buildx',
      'build',
      '--no-cache',
      '--provenance=false',
      '--sbom=false',
      '--platform',
      'linux/amd64',
      '--push',
      '-t',
      destination,
      directory,
    ]);
    return { digest: inspect(destination, execute), packages: packPath };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const outputFile = process.env.GITHUB_OUTPUT;
    const environmentFile = process.env.GITHUB_ENV;
    if (!outputFile || !environmentFile)
      throw new Error('GitHub output files are required.');
    const destination = run('aws', [
      'ecr',
      'describe-repositories',
      '--repository-names',
      process.env.ECR_REPOSITORY_NAME ?? '',
      '--query',
      'repositories[0].repositoryUri',
      '--output',
      'text',
    ]);
    const result = prepareServerImage({
      source: process.env.SERVER_IMAGE_REPOSITORY ?? '',
      tag: process.env.IMAGE_SHA ?? '',
      destination,
      bundleUri: process.env.CONTENT_HARNESS_BUNDLE_URI,
      bundleSha256: process.env.CONTENT_HARNESS_BUNDLE_SHA256,
    });
    appendFileSync(outputFile, `image_digest=${result.digest}\n`);
    appendFileSync(
      environmentFile,
      `TF_VAR_image_digest=${result.digest}\nTF_VAR_content_harness_packages=${result.packages}\n`,
    );
    console.log(
      result.packages
        ? 'Prepared hosted image with a verified content harness bundle; startup validates activation.'
        : 'Prepared hosted image with built-in content harness packs.',
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Hosted server image preparation failed.',
    );
    process.exitCode = 1;
  }
}
