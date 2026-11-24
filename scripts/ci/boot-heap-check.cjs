'use strict';

/**
 * Preload for the compiled-bundle boot check. It fails the check when the
 * live heap right after the module graph has loaded is above the budget in
 * `scripts/architecture/boot-heap.baseline.json`.
 *
 *   BOOT_CHECK=1 node --expose-gc -r ./scripts/ci/boot-heap-check.cjs \
 *     apps/server/dist/apps/api/main.js
 *
 * Why: full garbage collections of a large live heap stall every request for
 * hundreds of milliseconds on one CPU (#10110). The heap grew to 323 MB
 * before the first provider was built and nothing watched it. The budget is
 * a ratchet like the other baselines: lower it when a change shrinks the
 * heap, never raise it (`check:ratchet-growth` fails a pull request that does).
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');

const BYTES_PER_MB = 1024 * 1024;
const baselinePath = path.join(
  __dirname,
  '..',
  'architecture',
  'boot-heap.baseline.json',
);

function readBudgetMb() {
  const parsed = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!Number.isFinite(parsed.budgetMb) || parsed.budgetMb <= 0) {
    throw new Error(`${baselinePath} needs a positive budgetMb`);
  }
  return parsed.budgetMb;
}

const budgetMb = readBudgetMb();

process.on('exit', (code) => {
  // A boot that already failed has its own error; do not bury it.
  if (code !== 0) return;
  if (typeof global.gc !== 'function') {
    process.stderr.write(
      'boot heap check: run node with --expose-gc to measure the live heap\n',
    );
    process.exitCode = 1;
    return;
  }
  global.gc();
  const heapUsedMb = Math.round(process.memoryUsage().heapUsed / BYTES_PER_MB);
  const loadedFiles = Object.keys(require.cache).length;
  process.stderr.write(
    `boot heap check: ${heapUsedMb} MB live after load (budget ${budgetMb} MB, ${loadedFiles} files loaded)\n`,
  );
  if (heapUsedMb > budgetMb) {
    process.stderr.write(
      `boot heap check FAILED: ${heapUsedMb} MB is above the ${budgetMb} MB budget. Load the heavy dependency on demand (a dynamic import() at its one call site) instead of raising the budget; measure with the recipe in #11148.\n`,
    );
    process.exitCode = 1;
  }
});
