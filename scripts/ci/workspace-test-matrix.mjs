import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_TEST_TASK_PATTERN = /^@genfeedai\/[a-z0-9-]+#test$/u;

// Scheduling estimates from run 37527722448 (2026-10-06), not coverage rules.
// Each pool runs one Turbo task at a time. Vitest can use the runner's CPUs
// without competing with nine other packages' worker pools.
// Weights only balance legs. They are about four times the seconds measured on
// 2026-11-08/09 (all package pools together: 730 s of tests in the median run).
const PACKAGE_SECONDS = {
  '@genfeedai/agent': 650,
  '@genfeedai/workflows': 530,
  '@genfeedai/hooks': 525,
  '@genfeedai/helpers': 315,
  '@genfeedai/services': 280,
  '@genfeedai/contexts': 230,
  '@genfeedai/serializers': 200,
  '@genfeedai/contracts': 185,
};

// The two light groups share a leg with packages instead of paying their own
// ~90 s checkout and install: web measured 125 s of tests, the extension 50 s.
// Same units as PACKAGE_SECONDS.
const WEB_SECONDS = 500;
const BROWSER_EXTENSION_SECONDS = 200;
// A leg is worth its setup once it carries about this much test work (about
// 250 s measured). Test Workspaces runs at most four legs at once, so the
// server leg plus three pools fit one wave; seven legs waited for a second one
// (median span 797 s against a 397 s longest leg over 39 runs).
const POOL_TARGET_SECONDS = 1000;
const MAX_POOLS = 3;
const UI_SHARD_POOLS = 4;

export function allPackageTestTasks(root) {
  return readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = JSON.parse(
        readFileSync(
          path.join(root, 'packages', entry.name, 'package.json'),
          'utf8',
        ),
      );
      return manifest.scripts?.test ? [`${manifest.name}#test`] : [];
    });
}

function balance(items, count) {
  const pools = Array.from({ length: count }, () => ({
    items: [],
    weight: 0,
  }));
  const ordered = [...items].sort(
    (a, b) => b.weight - a.weight || a.key.localeCompare(b.key, 'en'),
  );
  for (const item of ordered) {
    const pool = pools.reduce((best, candidate) =>
      candidate.weight < best.weight ? candidate : best,
    );
    pool.items.push(item);
    pool.weight += item.weight;
  }
  return pools;
}

/**
 * Legs of the Test Workspaces job. Packages, the web group and the browser
 * extension share balanced `workspaces-i/N` legs; the server group keeps its
 * own leg because it owns the workers cron and MCP e2e steps. UI shards need
 * four distinct legs, so a selected UI package always yields four pools.
 *
 * `serverFilters` and `webFilters` are the Turbo filters of those groups, or an
 * empty string when the group does not apply. `browserExtension` is a boolean:
 * the extension always runs in full, never narrowed by --affected.
 */
export function buildWorkspaceTestMatrix({
  packageTasks,
  serverFilters = '',
  webFilters = '',
  browserExtension = false,
}) {
  const selected = [...new Set(packageTasks)];
  for (const task of selected) {
    if (!PACKAGE_TEST_TASK_PATTERN.test(task))
      throw new Error(`Invalid package test task: ${task}`);
  }
  const hasUi = selected.includes('@genfeedai/ui#test');
  const items = selected
    .filter((task) => task !== '@genfeedai/ui#test')
    .map((task) => task.slice(0, -'#test'.length))
    .map((name) => ({
      key: name,
      kind: 'filter',
      filters: `--filter=${name}`,
      weight: PACKAGE_SECONDS[name] ?? 30,
    }));
  if (webFilters)
    items.push({
      key: 'web',
      kind: 'filter',
      filters: webFilters,
      weight: WEB_SECONDS,
    });
  if (browserExtension)
    items.push({
      key: 'browser-extension',
      kind: 'extension',
      filters: '',
      weight: BROWSER_EXTENSION_SECONDS,
    });

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const count = hasUi
    ? UI_SHARD_POOLS
    : items.length === 0
      ? 0
      : Math.min(
          MAX_POOLS,
          Math.max(1, Math.ceil(total / POOL_TARGET_SECONDS)),
        );
  const legs = balance(items, count).map((pool, index) => ({
    group: 'workspaces',
    name: `workspaces-${index + 1}/${count}`,
    filters: pool.items
      .map((item) => item.filters)
      .filter(Boolean)
      .join(' '),
    extension: pool.items.some((item) => item.kind === 'extension')
      ? 'true'
      : '',
    ui_shard: hasUi ? `${index + 1}/${UI_SHARD_POOLS}` : '',
  }));
  if (serverFilters)
    legs.push({
      group: 'server',
      name: 'server',
      filters: serverFilters,
      extension: '',
      ui_shard: '',
    });
  return legs;
}
