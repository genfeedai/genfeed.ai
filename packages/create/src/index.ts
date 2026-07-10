#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, readFileSync, realpathSync } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { consola } from 'consola';

const REPOSITORY = 'genfeedai/genfeed.ai';
const RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const DEFAULT_DOWNLOAD_BASE_URL = `https://github.com/${REPOSITORY}/releases/download`;
const RELEASE_ARCHIVE_NAME = 'genfeed-selfhosted.tar.gz';
const RELEASE_CHECKSUM_NAME = `${RELEASE_ARCHIVE_NAME}.sha256`;
const RELEASE_MANIFEST_NAME = 'release.json';
const EXPECTED_IMAGE_REPOSITORY = 'ghcr.io/genfeedai/genfeed.ai';
const APP_URL = 'http://localhost:3000';

interface CliOptions {
  release?: string;
  start: boolean;
}

interface ReleaseManifest {
  schemaVersion: number;
  releaseTag: string;
  image: string;
}

interface ReleaseAssetUrls {
  archive: string;
  checksum: string;
}

interface RunCommandOptions {
  cwd?: string;
  stdio?: 'ignore' | 'inherit';
}

type FetchImplementation = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeReleaseTag(value: string): string {
  const trimmed = value.trim();
  const releaseTag = trimmed.startsWith('v') ? trimmed : `v${trimmed}`;

  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseTag)) {
    throw new Error(
      `Invalid release "${value}". Expected vX.Y.Z (for example, v0.5.0).`,
    );
  }

  return releaseTag;
}

export function imageTagFromReleaseTag(releaseTag: string): string {
  return normalizeReleaseTag(releaseTag).slice(1);
}

export function getReleaseAssetUrls(
  releaseTag: string,
  downloadBaseUrl = process.env.GENFEED_RELEASE_DOWNLOAD_BASE_URL ??
    DEFAULT_DOWNLOAD_BASE_URL,
): ReleaseAssetUrls {
  const normalizedTag = normalizeReleaseTag(releaseTag);
  const baseUrl = downloadBaseUrl.replace(/\/$/, '');

  return {
    archive: `${baseUrl}/${normalizedTag}/${RELEASE_ARCHIVE_NAME}`,
    checksum: `${baseUrl}/${normalizedTag}/${RELEASE_CHECKSUM_NAME}`,
  };
}

export async function resolveReleaseTag(
  requestedRelease?: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<string> {
  if (requestedRelease) {
    return normalizeReleaseTag(requestedRelease);
  }

  const response = await fetchImplementation(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': '@genfeedai/create',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Could not resolve the latest Genfeed.ai release (HTTP ${response.status}).`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error('GitHub returned invalid latest-release metadata.');
  }

  const tagName = payload.tag_name;
  if (typeof tagName !== 'string') {
    throw new Error('GitHub latest release did not include a release tag.');
  }

  return normalizeReleaseTag(tagName);
}

export function readPackageVersion(
  packageJsonUrl = new URL('../package.json', import.meta.url),
): string {
  const manifest: unknown = JSON.parse(
    readFileSync(fileURLToPath(packageJsonUrl), 'utf8'),
  );
  if (!isRecord(manifest) || typeof manifest.version !== 'string') {
    throw new Error('Could not read the @genfeedai/create package version.');
  }

  return manifest.version;
}

async function downloadFile(
  url: string,
  destination: string,
  fetchImplementation: FetchImplementation,
): Promise<void> {
  const response = await fetchImplementation(url, {
    headers: { 'User-Agent': '@genfeedai/create' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
  }

  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

export async function verifyReleaseChecksum(
  archivePath: string,
  checksumPath: string,
): Promise<void> {
  const checksumContent = await readFile(checksumPath, 'utf8');
  const match = checksumContent.match(/^([a-fA-F0-9]{64})\s+/);

  if (!match) {
    throw new Error('Release checksum file is malformed.');
  }

  const archive = await readFile(archivePath);
  const actualChecksum = createHash('sha256').update(archive).digest('hex');
  const expectedChecksum = match[1].toLowerCase();

  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Release checksum mismatch: expected ${expectedChecksum}, received ${actualChecksum}.`,
    );
  }
}

export function parseReleaseManifest(
  content: string,
  expectedReleaseTag: string,
): ReleaseManifest {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error('Release manifest is not an object.');
  }

  const normalizedTag = normalizeReleaseTag(expectedReleaseTag);
  const expectedImage = `${EXPECTED_IMAGE_REPOSITORY}:${imageTagFromReleaseTag(normalizedTag)}`;
  const schemaVersion = parsed.schemaVersion;
  const releaseTag = parsed.releaseTag;
  const image = parsed.image;

  if (
    schemaVersion !== 1 ||
    releaseTag !== normalizedTag ||
    image !== expectedImage
  ) {
    throw new Error(
      `Release manifest does not match ${normalizedTag} and ${expectedImage}.`,
    );
  }

  return {
    image,
    releaseTag,
    schemaVersion,
  };
}

function commandExists(
  command: string,
  args: string[] = ['--version'],
): boolean {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'inherit',
    });

    child.once('error', rejectPromise);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with ${code ?? signal ?? 'an unknown error'}.`,
        ),
      );
    });
  });
}

function assertInstallPrerequisites(): void {
  if (!commandExists('tar')) {
    throw new Error(
      'tar is required to extract the Genfeed.ai release bundle.',
    );
  }

  if (!commandExists('docker', ['compose', 'version'])) {
    throw new Error(
      'Docker Compose is required. Install Docker Desktop or the Docker Compose plugin.',
    );
  }
}

async function waitForApp(
  fetchImplementation: FetchImplementation,
  timeoutMs = 180_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchImplementation(APP_URL, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return true;
      }
    } catch {
      // The container is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }

  return false;
}

export function openBrowser(url: string): void {
  let command: string | undefined;
  let args: string[] = [];

  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'linux') {
    command = 'xdg-open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  }

  if (!command) {
    return;
  }

  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.once('error', () => {
    // Opening a browser is a convenience; the installation is already ready.
  });
  child.unref();
}

export async function installRelease(
  projectName: string,
  options: CliOptions,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  assertInstallPrerequisites();

  const projectDirectory = resolve(process.cwd(), projectName);
  try {
    await access(projectDirectory);
    throw new Error(`Destination already exists: ${projectDirectory}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Destination')) {
      throw error;
    }
  }

  const releaseTag = await resolveReleaseTag(
    options.release,
    fetchImplementation,
  );
  const assetUrls = getReleaseAssetUrls(releaseTag);
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'genfeed-create-release-'),
  );
  const archivePath = join(temporaryDirectory, RELEASE_ARCHIVE_NAME);
  const checksumPath = join(temporaryDirectory, RELEASE_CHECKSUM_NAME);
  let createdProjectDirectory = false;
  let startAttempted = false;

  consola.start(`Downloading Genfeed.ai ${releaseTag}`);

  try {
    await Promise.all([
      downloadFile(assetUrls.archive, archivePath, fetchImplementation),
      downloadFile(assetUrls.checksum, checksumPath, fetchImplementation),
    ]);
    await verifyReleaseChecksum(archivePath, checksumPath);

    await mkdir(projectDirectory);
    createdProjectDirectory = true;
    await runCommand(
      'tar',
      ['-xzf', archivePath, '-C', projectDirectory, '--strip-components=1'],
      { stdio: 'ignore' },
    );

    const releaseManifest = parseReleaseManifest(
      await readFile(join(projectDirectory, RELEASE_MANIFEST_NAME), 'utf8'),
      releaseTag,
    );
    await copyFile(
      join(projectDirectory, '.env.example'),
      join(projectDirectory, '.env'),
      constants.COPYFILE_EXCL,
    );

    await runCommand(
      'docker',
      [
        'compose',
        '--env-file',
        '.env',
        '-f',
        'compose.yml',
        'config',
        '--quiet',
      ],
      { cwd: projectDirectory, stdio: 'ignore' },
    );

    consola.success(
      `Installed ${releaseManifest.releaseTag} (${releaseManifest.image}) in ${projectDirectory}`,
    );

    if (!options.start) {
      consola.info(
        `Start later with: cd ${projectName} && docker compose --env-file .env -f compose.yml up -d`,
      );
      return;
    }

    startAttempted = true;
    await runCommand(
      'docker',
      ['compose', '--env-file', '.env', '-f', 'compose.yml', 'up', '-d'],
      { cwd: projectDirectory },
    );

    consola.start('Waiting for Genfeed.ai to become ready…');
    if (await waitForApp(fetchImplementation)) {
      consola.success(`Genfeed.ai is running at ${APP_URL}`);
      openBrowser(APP_URL);
    } else {
      consola.warn(`The containers started, but ${APP_URL} is not ready yet.`);
    }
  } catch (error) {
    if (createdProjectDirectory && !startAttempted) {
      await rm(projectDirectory, { force: true, recursive: true });
    } else if (startAttempted) {
      consola.warn(
        `Startup failed. Installation files were preserved at ${projectDirectory} for inspection or recovery.`,
      );
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function main(): Promise<void> {
  const program = new Command()
    .name('genfeedai')
    .description('Install a public Genfeed.ai Community release.')
    .version(readPackageVersion())
    .argument('<project-name>', 'Directory for the self-hosted installation')
    .option('--release <tag>', 'Install an exact release (for example, v0.5.0)')
    .option(
      '--no-start',
      'Prepare and verify the installation without starting it',
    )
    .action(async (projectName: string, options: CliOptions) => {
      await installRelease(projectName, options);
    })
    .showHelpAfterError();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error('Unknown CLI error');
    consola.error(normalizedError.message);
    process.exitCode = 1;
  }
}

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main();
}
