#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const appShellRoot = path.join(desktopRoot, 'dist', 'app-shell');
const mainBundlePath = path.join(desktopRoot, 'dist', 'main.js');
const MEBIBYTE = 1024 * 1024;
const APP_SHELL_BUDGET_MIB = 150;
const MAIN_BUNDLE_BUDGET_MIB = 50;

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
  path.join(appShellRoot, 'apps', 'app', 'node_modules'),
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
