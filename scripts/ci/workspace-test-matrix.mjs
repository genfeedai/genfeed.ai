import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Scheduling estimates from run 37527722448 (2026-10-06), not coverage rules.
// Each pool runs one Turbo task at a time. Vitest can use the runner's CPUs
// without competing with nine other packages' worker pools.
const PACKAGE_SECONDS = {
  '@genfeedai/pages': 840,
  '@genfeedai/agent': 650,
  '@genfeedai/workflows': 530,
  '@genfeedai/hooks': 525,
  '@genfeedai/helpers': 315,
  '@genfeedai/services': 280,
  '@genfeedai/contexts': 230,
  '@genfeedai/serializers': 200,
  '@genfeedai/contracts': 185,
};

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

export function buildPackageTestMatrix(tasks) {
  const selected = [...new Set(tasks)];
  for (const task of selected) {
    if (!/^@genfeedai\/[a-z0-9-]+#test$/u.test(task))
      throw new Error(`Invalid package test task: ${task}`);
  }
  const hasUi = selected.includes('@genfeedai/ui#test');
  const packages = selected
    .filter((task) => task !== '@genfeedai/ui#test')
    .map((task) => task.slice(0, -'#test'.length));
  const count = hasUi ? 4 : Math.min(4, packages.length);
  const pools = Array.from({ length: count }, () => ({
    packages: [],
    weight: 0,
  }));
  const weight = (name) => PACKAGE_SECONDS[name] ?? 30;
  packages.sort((a, b) => weight(b) - weight(a) || a.localeCompare(b, 'en'));
  for (const name of packages) {
    const pool = pools.reduce((best, candidate) =>
      candidate.weight < best.weight ? candidate : best,
    );
    pool.packages.push(name);
    pool.weight += weight(name);
  }
  return pools.map((pool, index) => ({
    group: 'packages',
    name: `packages-${index + 1}/${count}`,
    filters: pool.packages.map((name) => `--filter=${name}`).join(' '),
    ui_shard: hasUi ? `${index + 1}/4` : '',
  }));
}
