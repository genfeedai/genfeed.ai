#!/usr/bin/env node
// Generates the Prisma client, unless the client on disk is already the one
// this checkout would generate.
//
// `bun install` runs this as the package's postinstall. Generating the client
// for this schema takes 30 to 40 seconds and used to run on every install, so
// every CI job and every local `bun install` paid for it even when nothing the
// client is generated from had changed (#10276).
//
// A stamp beside the client records what it was generated from and a digest of
// the files that came out. Generation is skipped only while both still match:
// an edited schema or config, a Prisma upgrade, and a client that was changed,
// deleted or left half written all generate again. `--force` always generates.
//
// This file lives in prisma/ because the image builds copy only this directory
// and prisma.config.mjs before they install (docker/Dockerfile.server and
// docker/Dockerfile.selfhosted).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STAMP_FORMAT = 1;
const CLIENT_DIRECTORY = 'generated/prisma/client';
const STAMP_FILE = 'generated/prisma/client-stamp.json';
// prisma.config.mjs names the schema; a contract test keeps the two in step.
const GENERATION_INPUT_FILES = ['prisma.config.mjs', 'prisma/schema.prisma'];
const GENERATOR_PACKAGES = ['prisma', '@prisma/client'];
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

function addFile(hash, name, content) {
  hash.update(`${name}\0${content.length}\0`);
  hash.update(content);
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

/**
 * Digest of everything the client is generated from, or null when that cannot
 * be known: a missing input, or a Prisma dependency that is a range and could
 * resolve to another generator without any file here changing.
 *
 * @param {string} packageRoot
 * @returns {string | null}
 */
export function digestGenerationInputs(packageRoot) {
  const hash = createHash('sha256');
  hash.update(`format ${STAMP_FORMAT}\n`);
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    for (const name of GENERATOR_PACKAGES) {
      const version = manifest.dependencies?.[name] ?? '';
      if (!EXACT_VERSION_PATTERN.test(version)) return null;
      hash.update(`${name}@${version}\n`);
    }
    for (const file of GENERATION_INPUT_FILES) {
      addFile(hash, file, readFileSync(path.join(packageRoot, file)));
    }
  } catch (caught) {
    if (caught?.code === 'ENOENT') return null;
    throw caught;
  }
  return hash.digest('hex');
}

/**
 * Digest of the generated files, or null when there are none.
 *
 * @param {string} packageRoot
 * @returns {string | null}
 */
export function digestClient(packageRoot) {
  const directory = path.join(packageRoot, CLIENT_DIRECTORY);
  if (!existsSync(directory)) return null;
  const files = listFiles(directory);
  if (files.length === 0) return null;
  const hash = createHash('sha256');
  for (const file of files) {
    addFile(hash, file, readFileSync(path.join(directory, file)));
  }
  return hash.digest('hex');
}

function readStamp(packageRoot) {
  try {
    return JSON.parse(readFileSync(path.join(packageRoot, STAMP_FILE), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {{ packageRoot: string, generate: () => void, force?: boolean }} options
 * @returns {'current' | 'generated'}
 */
export function ensureClient({ packageRoot, generate, force = false }) {
  const inputs = digestGenerationInputs(packageRoot);
  if (!force && inputs !== null) {
    const stamp = readStamp(packageRoot);
    if (
      stamp?.format === STAMP_FORMAT &&
      stamp.inputs === inputs &&
      stamp.client === digestClient(packageRoot)
    ) {
      return 'current';
    }
  }

  // Removed first, so a generation that fails part way leaves no stamp that
  // could vouch for the files it did write.
  rmSync(path.join(packageRoot, STAMP_FILE), { force: true });
  generate();
  const client = digestClient(packageRoot);
  if (inputs !== null && client !== null) {
    writeFileSync(
      path.join(packageRoot, STAMP_FILE),
      `${JSON.stringify({ client, format: STAMP_FORMAT, inputs })}\n`,
    );
  }
  return 'generated';
}

function runPrismaGenerate(packageRoot) {
  // Through the shell so the workspace's own `prisma` binary resolves from the
  // PATH Bun gives a package script, on every platform.
  const result = spawnSync('prisma generate', {
    cwd: packageRoot,
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `prisma generate exited with ${result.status ?? result.signal}`,
    );
  }
}

function main() {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  try {
    const outcome = ensureClient({
      force: process.argv.includes('--force'),
      generate: () => runPrismaGenerate(packageRoot),
      packageRoot,
    });
    if (outcome === 'current') {
      process.stdout.write(
        'Prisma client is current for this schema; skipped generation.\n',
      );
    }
  } catch (caught) {
    process.stderr.write(
      `${caught instanceof Error ? caught.message : String(caught)}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
