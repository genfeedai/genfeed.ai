#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');
const electronPath = require('electron');

const desktopRoot = path.resolve(__dirname, '..');
// Electron embeds the canonical product app; no desktop-local Next app remains.
const appRoot = path.resolve(desktopRoot, '../../app');
const appPort = process.env.GENFEED_DESKTOP_APP_PORT || '3230';
const appUrl = `http://127.0.0.1:${appPort}`;
const apiEndpoint =
  process.env.GENFEED_DESKTOP_API_URL ||
  process.env.NEXT_PUBLIC_API_ENDPOINT ||
  'http://localhost:3010/v1';
const apiOrigin = apiEndpoint.replace(/\/v1\/?$/, '');
const cdnUrl =
  process.env.GENFEED_DESKTOP_CDN_URL ||
  process.env.NEXT_PUBLIC_CDN_URL ||
  'https://cdn.genfeed.ai';
const wsEndpoint =
  process.env.GENFEED_DESKTOP_WS_URL ||
  process.env.NEXT_PUBLIC_WS_ENDPOINT ||
  'https://notifications.genfeed.ai';

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.stdio || 'inherit',
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await wait(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const nativeBuild = run('bun', ['run', 'build:native'], {
    cwd: desktopRoot,
  });

  const nativeBuildCode = await new Promise((resolve) => {
    nativeBuild.on('close', (code) => resolve(code ?? 1));
  });

  if (nativeBuildCode !== 0) {
    process.exit(nativeBuildCode);
  }

  const appServer = run(
    'bunx',
    ['next', 'dev', '--hostname', '127.0.0.1', '--port', appPort],
    {
      cwd: appRoot,
      env: {
        API_URL: apiOrigin,
        GENFEED_DESKTOP_API_URL: apiEndpoint,
        NEXT_PUBLIC_API_ENDPOINT: `${appUrl}/v1`,
        NEXT_PUBLIC_API_URL: '/v1',
        NEXT_PUBLIC_CDN_URL: cdnUrl,
        NEXT_PUBLIC_DESKTOP_SHELL: '1',
        NEXT_PUBLIC_WS_ENDPOINT: wsEndpoint,
        PORT: appPort,
      },
    },
  );

  try {
    await waitForServer(appUrl);
  } catch (error) {
    appServer.kill();
    throw error;
  }

  const electronProcess = run(electronPath, ['dist/main.js'], {
    cwd: desktopRoot,
    env: {
      ELECTRON_RUN_AS_NODE: '',
      GENFEED_DESKTOP_APP_URL: appUrl,
      NEXT_PUBLIC_DESKTOP_SHELL: '1',
    },
  });

  const shutdown = () => {
    electronProcess.kill();
    appServer.kill();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  electronProcess.on('close', (code) => {
    appServer.kill();
    process.exit(code ?? 0);
  });

  appServer.on('close', (code, signal) => {
    electronProcess.kill();
    process.exit(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1));
  });
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
