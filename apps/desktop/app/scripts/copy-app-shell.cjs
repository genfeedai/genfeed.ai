#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(desktopRoot, '../../app');
const standaloneRoot = path.join(appRoot, '.next', 'standalone');
const staticRoot = path.join(appRoot, '.next', 'static');
const publicRoot = path.join(appRoot, 'public');
const outputRoot = path.join(desktopRoot, 'dist', 'app-shell');

function copyDirectory(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function findServerDirectory(root) {
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name === 'server.js') {
        return path.dirname(absolutePath);
      }
    }
  }

  return null;
}

if (!fs.existsSync(standaloneRoot)) {
  throw new Error(`Standalone app shell not found at ${standaloneRoot}`);
}

fs.rmSync(outputRoot, { force: true, recursive: true });
copyDirectory(standaloneRoot, outputRoot);

const serverDirectory = findServerDirectory(standaloneRoot);

if (!serverDirectory) {
  throw new Error(`Could not locate server.js inside ${standaloneRoot}`);
}

const relativeServerDirectory = path.relative(standaloneRoot, serverDirectory);

if (fs.existsSync(staticRoot)) {
  copyDirectory(
    staticRoot,
    path.join(outputRoot, relativeServerDirectory, '.next', 'static'),
  );
}

if (fs.existsSync(publicRoot)) {
  copyDirectory(publicRoot, path.join(outputRoot, relativeServerDirectory, 'public'));
}
