#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(desktopRoot, '../../app');
const apiEndpoint =
  process.env.GENFEED_DESKTOP_API_URL || 'https://api.genfeed.ai/v1';

const child = spawn('bun', ['run', 'build'], {
  cwd: appRoot,
  env: {
    ...process.env,
    API_URL: apiEndpoint,
    GENFEED_DESKTOP_BUNDLE: '1',
    NEXT_PUBLIC_API_ENDPOINT: apiEndpoint,
    NEXT_PUBLIC_DESKTOP_SHELL: '1',
  },
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
