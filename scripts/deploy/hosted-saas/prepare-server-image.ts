import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const IMAGE_TAG_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const GHCR_REPOSITORY_PATTERN = /^ghcr\.io\/[a-z0-9._/-]+$/;

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const privateEcrPattern =
  /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?\/[a-z0-9][a-z0-9._/-]*$/;
type CommandRunner = (command: string, args: string[]) => string;
interface ImageConfiguration {
  source: string;
  tag: string;
  destination: string;
}

function run(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
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

export function prepareServerImage(
  config: ImageConfiguration,
  execute: CommandRunner = run,
): { digest: string; publicDigest: string } {
  if (!privateEcrPattern.test(config.destination))
    throw new Error('Hosted images require a private ECR destination.');
  if (
    !IMAGE_TAG_PATTERN.test(config.tag) ||
    !GHCR_REPOSITORY_PATTERN.test(config.source)
  )
    throw new Error('Invalid source image reference.');
  const baseDigest = inspect(`${config.source}:${config.tag}`, execute);
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
  return { digest, publicDigest: baseDigest };
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
    });
    appendFileSync(
      outputFile,
      `image_digest=${result.digest}\npublic_image_digest=${result.publicDigest}\n`,
    );
    appendFileSync(environmentFile, `TF_VAR_image_digest=${result.digest}\n`);
    console.log('Prepared hosted image from the public server digest.');
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Hosted server image preparation failed.',
    );
    process.exitCode = 1;
  }
}
