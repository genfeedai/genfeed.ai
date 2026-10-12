import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { NATIVE_HOST_PROTOCOL_VERSION } from '@genfeedai/contracts/constants';
import { afterEach } from 'vitest';
import {
  emptyHostConfig,
  type HostConfig,
  resolveHostPaths,
  writeHostConfig,
} from '../../../src/commands/host/config';
import { encodeFrame, FrameDecoder } from '../../../src/commands/host/framing';

export const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
export const REQUEST_ID = '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

export async function makeTemporaryDirectory(prefix = 'gf-host-test-'): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

/** Writes a POSIX shell script that is executable. */
export async function writeExecutable(
  directory: string,
  name: string,
  body: string
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await chmod(file, 0o755);
  return file;
}

export async function makeHostHome(config: Partial<HostConfig> = {}): Promise<{
  home: string;
  paths: ReturnType<typeof resolveHostPaths>;
}> {
  const home = await makeTemporaryDirectory();
  const paths = resolveHostPaths(home);
  await writeHostConfig(paths, {
    ...emptyHostConfig(),
    allowedOrigins: [EXTENSION_ORIGIN],
    ...config,
  });
  return { home, paths };
}

export function detectRequest() {
  return { requestId: REQUEST_ID, type: 'detect', version: NATIVE_HOST_PROTOCOL_VERSION } as const;
}

export function refineRequest(overrides: Record<string, unknown> = {}) {
  return {
    action: {
      action: 'refine_text',
      mode: 'rewrite',
      platform: 'twitter',
      text: 'teh launch is live @ada #ship',
    },
    providerId: 'claude-cli',
    requestId: REQUEST_ID,
    type: 'generate',
    version: NATIVE_HOST_PROTOCOL_VERSION,
    voice: null,
    ...overrides,
  };
}

export function repliesRequest(overrides: Record<string, unknown> = {}) {
  return {
    action: {
      action: 'generate_reply_variants',
      platform: 'twitter',
      postAuthor: '@ada',
      postContent: 'We shipped dark mode today.',
      tone: 'add-value',
      variants: 2,
    },
    providerId: 'claude-cli',
    requestId: REQUEST_ID,
    type: 'generate',
    version: NATIVE_HOST_PROTOCOL_VERSION,
    voice: null,
    ...overrides,
  };
}

export function voiceSnapshot() {
  return {
    brandId: 'brand-1',
    contentHash: 'sha256:abc',
    identity: { description: 'Developer tools for creators', name: 'Genfeed' },
    resolvedAt: '2026-10-01T10:00:00.000Z',
    revisionId: 'rev-1',
    rules: {
      avoid: ['Never promise results'],
      examples: [{ polarity: 'positive', text: 'Ship it, then show it.' }],
      facts: ['Genfeed is spelled with a capital G'],
      mandatory: ['Mention the studio when relevant'],
    },
    schemaVersion: 1,
    voice: {
      audience: ['indie makers'],
      avoid: ['jargon'],
      guidelines: 'Short sentences.',
      messagingPillars: ['speed'],
      sample: 'Make it. Post it.',
      style: 'Direct',
      tone: 'Warm and confident',
      values: ['craft'],
    },
  } as const;
}

/** An in-memory stand-in for the pipes a browser gives the host. */
export function createPipes() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const decoder = new FrameDecoder(10_000_000);
  const received: unknown[] = [];
  stdout.on('data', (chunk: Buffer) => {
    received.push(...decoder.push(chunk));
  });
  return {
    receivedFrames: () => received,
    send: (message: unknown) => stdin.write(encodeFrame(message, 10_000_000)),
    stderr,
    stdin,
    stdout,
    waitForFrames: async (count: number) => {
      for (let attempt = 0; attempt < 400 && received.length < count; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return received;
    },
  };
}
