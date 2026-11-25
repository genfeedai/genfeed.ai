#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { listTracedSourceFiles } = require('./prune-app-shell.cjs');
const {
  findOversizedManifests,
  listRouteManifests,
} = require('./route-manifest-size.cjs');

const desktopRoot = path.resolve(__dirname, '..');
const appShellRoot = path.join(desktopRoot, 'dist', 'app-shell');
const appServerRoot = path.join(
  appShellRoot,
  'apps',
  'web',
  '.next',
  'server',
  'app',
);
const mainBundlePath = path.join(desktopRoot, 'dist', 'main.js');
const MEBIBYTE = 1024 * 1024;
const APP_SHELL_BUDGET_MIB = 150;
const MAIN_BUNDLE_BUDGET_MIB = 50;
// The largest route manifest measures 480 KiB (org publishing). A page that
// imports a shared barrel lists every client component behind it, so growth
// past this limit usually means a new barrel import: import the modules
// directly instead of raising the limit.
const ROUTE_MANIFEST_LIMIT_KIB = 512;

function directorySize(root) {
  let total = 0;
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile()) {
        total += fs.statSync(absolutePath).size;
      }
    }
  }

  return total;
}

function assertMissing(target, reason) {
  if (fs.existsSync(target)) {
    throw new Error(`${reason}: ${target}`);
  }
}

function assertWithinBudget(label, bytes, budgetMib) {
  const sizeMib = bytes / MEBIBYTE;

  if (sizeMib > budgetMib) {
    throw new Error(
      `${label} is ${sizeMib.toFixed(1)} MiB and exceeds its ${budgetMib} MiB budget.`,
    );
  }

  process.stdout.write(
    `[desktop] ${label}: ${sizeMib.toFixed(1)} MiB / ${budgetMib} MiB\n`,
  );
}

if (!fs.existsSync(appShellRoot) || !fs.existsSync(mainBundlePath)) {
  throw new Error(
    'Desktop bundle outputs are missing; run the desktop build first.',
  );
}

assertMissing(
  path.join(appShellRoot, 'node_modules', '.bun'),
  'Bun dependency store leaked into the packaged app shell',
);
assertMissing(
  path.join(appShellRoot, 'apps', 'web', 'node_modules'),
  'Nested Next.js dependency copy leaked into the packaged app shell',
);
assertMissing(
  path.join(appShellRoot, 'node_modules', 'sharp'),
  'Desktop bundle unexpectedly includes the disabled native image optimizer',
);
assertMissing(
  path.join(appShellRoot, 'node_modules', '@img'),
  'Desktop bundle unexpectedly includes sharp native image packages',
);

assertMissing(
  path.join(appServerRoot, '(protected)', 'admin'),
  'Platform admin routes leaked into the packaged app shell',
);

const oversizedManifests = findOversizedManifests(
  listRouteManifests(appServerRoot),
  ROUTE_MANIFEST_LIMIT_KIB * 1024,
);
if (oversizedManifests.length > 0) {
  throw new Error(
    `Client-reference manifests over ${ROUTE_MANIFEST_LIMIT_KIB} KiB:\n${oversizedManifests
      .map(
        ({ bytes, route }) => `  ${route} is ${(bytes / 1024).toFixed(0)} KiB`,
      )
      .join('\n')}`,
  );
}

const tracedSourceFiles = listTracedSourceFiles(
  path.join(appShellRoot, 'apps', 'web'),
);
if (tracedSourceFiles.length > 0) {
  throw new Error(
    `Traced TypeScript sources leaked into the packaged app shell (${tracedSourceFiles.length} files), e.g. ${tracedSourceFiles[0]}`,
  );
}

assertWithinBudget(
  'app shell',
  directorySize(appShellRoot),
  APP_SHELL_BUDGET_MIB,
);
assertWithinBudget(
  'main bundle',
  fs.statSync(mainBundlePath).size,
  MAIN_BUNDLE_BUDGET_MIB,
);
