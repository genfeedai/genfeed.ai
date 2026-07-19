#!/usr/bin/env node

const { spawn } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');

if (typeof electronPath !== 'string') {
  throw new TypeError('Electron did not resolve to an executable path.');
}

const child = spawn(
  electronPath,
  [path.join(desktopRoot, 'dist/main.js'), '--smoke-test'],
  {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      GENFEED_DESKTOP_SMOKE_TEST: '1',
    },
    stdio: 'inherit',
  },
);

let didTimeOut = false;
let forceKillTimeout;

const timeout = setTimeout(() => {
  didTimeOut = true;
  process.stderr.write('Desktop smoke test exceeded 60 seconds.\n');
  child.kill('SIGTERM');
  forceKillTimeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
}, 60_000);

function clearTimers() {
  clearTimeout(timeout);
  if (forceKillTimeout) {
    clearTimeout(forceKillTimeout);
  }
}

child.once('error', (error) => {
  clearTimers();
  process.stderr.write(
    `Failed to start Desktop smoke test: ${error.message}\n`,
  );
  process.exit(1);
});

child.once('exit', (code, signal) => {
  clearTimers();

  if (didTimeOut) {
    process.exit(1);
  }

  if (code !== 0) {
    process.stderr.write(
      `Desktop smoke test exited with ${String(code)}${signal ? ` (${signal})` : ''}.\n`,
    );
    process.exit(code ?? 1);
  }
});
