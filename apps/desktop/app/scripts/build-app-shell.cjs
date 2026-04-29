#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const appRoot = desktopRoot;
const apiEndpoint =
  process.env.GENFEED_DESKTOP_API_URL || 'http://localhost:3010/v1';
const apiBaseUrl = apiEndpoint.replace(/\/v1\/?$/, '');

const child = spawn('bunx', ['next', 'build'], {
  cwd: appRoot,
  env: {
    ...process.env,
    API_URL: apiBaseUrl,
    GENFEED_DESKTOP_BUNDLE: '1',
    GENFEED_DESKTOP_API_URL: apiEndpoint,
    NEXT_PUBLIC_API_ENDPOINT: apiEndpoint,
    NEXT_PUBLIC_DESKTOP_SHELL: '1',
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
