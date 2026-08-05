#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
// Electron embeds the canonical product app; no desktop-local Next app remains.
const appRoot = path.resolve(desktopRoot, '../../app');
const appPort = process.env.GENFEED_DESKTOP_APP_PORT || '3230';
const appUrl = `http://127.0.0.1:${appPort}`;
const apiEndpoint =
  process.env.GENFEED_DESKTOP_API_URL || 'https://api.genfeed.ai/v1';
const apiOrigin = apiEndpoint.replace(/\/v1\/?$/, '');
const cdnUrl =
  process.env.GENFEED_DESKTOP_CDN_URL ||
  process.env.NEXT_PUBLIC_CDN_URL ||
  'https://cdn.genfeed.ai';
const wsEndpoint =
  process.env.GENFEED_DESKTOP_WS_URL ||
  process.env.NEXT_PUBLIC_WS_ENDPOINT ||
  'https://notifications.genfeed.ai';

const child = spawn('bunx', ['next', 'build'], {
  cwd: appRoot,
  // Next inlines public values and serializes the /v1 rewrite target at build time.
  env: {
    ...process.env,
    API_URL: apiOrigin,
    GENFEED_DESKTOP_BUNDLE: '1',
    GENFEED_DESKTOP_API_URL: apiEndpoint,
    NEXT_PUBLIC_API_ENDPOINT: `${appUrl}/v1`,
    NEXT_PUBLIC_API_URL: '/v1',
    NEXT_PUBLIC_CDN_URL: cdnUrl,
    NEXT_PUBLIC_DESKTOP_SHELL: '1',
    NEXT_PUBLIC_WS_ENDPOINT: wsEndpoint,
  },
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  process.stderr.write(`Failed to start app-shell build: ${error.message}\n`);
  process.exit(1);
});
