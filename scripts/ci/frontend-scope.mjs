import { execFileSync } from 'node:child_process';
import { appendFileSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FRONTENDS = ['app', 'website'];
const GLOBAL_INPUTS = [
  /^(bun\.lock|package\.json|turbo\.json|\.bun-version|tsconfig[^/]*\.json)$/,
  /^(configs|patches)\//,
  /^\.env(?:\.|$)/,
  /^scripts\/(?:env[^/]*\.ts|collect-bundle-manifest\.ts|compare-bundle-manifests\.ts)$/,
  /^scripts\/ci\/frontend-scope\./,
  /^\.github\/actions\/(?:setup-bun-env|setup-playwright-app|detect-frontend-scope)\//,
  /^\.github\/workflows\/(?:bundle-size|link-check)\.yml$/,
];

export function affectedFrontends(changedFiles, workspaces) {
  const byName = new Map();
  for (const workspace of workspaces) {
    if (byName.has(workspace.name))
      throw new Error(`Duplicate workspace ${workspace.name}`);
    byName.set(workspace.name, workspace);
  }
  for (const app of FRONTENDS) {
    if (!byName.has(`@genfeedai/${app}`))
      throw new Error(`Missing frontend ${app}`);
  }
  // A removed/unregistered workspace cannot be traversed in the current graph.
  // Keep checks conservative when the changed package has no loaded manifest.
  if (
    changedFiles.some(
      (file) =>
        file.startsWith('packages/') &&
        !workspaces.some((workspace) =>
          file.startsWith(`${workspace.directory}/`),
        ),
    )
  ) {
    return [...FRONTENDS];
  }
  if (
    changedFiles.some((file) =>
      GLOBAL_INPUTS.some((pattern) => pattern.test(file)),
    )
  ) {
    return [...FRONTENDS];
  }
  return FRONTENDS.filter((app) => {
    const visited = new Set();
    const pending = [`@genfeedai/${app}`];
    while (pending.length) {
      const name = pending.pop();
      if (visited.has(name)) continue;
      visited.add(name);
      const workspace = byName.get(name);
      if (!workspace) continue; // Registry-only dependencies have no local sources.
      if (
        changedFiles.some((file) => file.startsWith(`${workspace.directory}/`))
      )
        return true;
      pending.push(...workspace.dependencies);
    }
    return false;
  });
}

export function loadWorkspaces(root) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  return manifest.workspaces.flatMap((pattern) =>
    globSync(`${pattern}/package.json`, { cwd: root }).map((file) => {
      const workspace = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
      return {
        name: workspace.name,
        directory: path.dirname(file).replaceAll('\\', '/'),
        dependencies: [
          ...new Set(
            [
              'dependencies',
              'devDependencies',
              'peerDependencies',
              'optionalDependencies',
            ].flatMap((key) => Object.keys(workspace[key] ?? {})),
          ),
        ],
      };
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = process.cwd();
  const base = process.env.BASE_SHA ?? '';
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  let apps = [...FRONTENDS];
  if (
    ['pull_request', 'push'].includes(process.env.EVENT_NAME) &&
    base &&
    !/^0{40}$/.test(base)
  ) {
    if (!/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head))
      throw new Error('Frontend scope requires exact commit SHAs.');
    const range =
      process.env.EVENT_NAME === 'pull_request'
        ? `${base}...${head}`
        : `${base}..${head}`;
    const changed = execFileSync(
      'git',
      ['diff', '--no-renames', '--name-only', '-z', range],
      {
        encoding: 'utf8',
      },
    )
      .split('\0')
      .filter(Boolean);
    apps = affectedFrontends(changed, loadWorkspaces(root));
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `apps=${JSON.stringify(apps)}`,
      `frontend=${apps.length > 0}`,
      ...FRONTENDS.map((app) => `${app}=${apps.includes(app)}`),
      '',
    ].join('\n'),
  );
}
