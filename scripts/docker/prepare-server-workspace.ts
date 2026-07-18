#!/usr/bin/env bun

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;
const SERVER_WORKSPACE_PREFIX = 'apps/server/';

type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  workspaces?: string[];
};

type WorkspaceManifest = {
  manifest: PackageManifest;
  path: string;
};

export type PrepareServerWorkspaceOptions = {
  outputRoot: string;
  repoRoot: string;
  seedWorkspacePaths?: string[];
};

export type PrepareServerWorkspaceResult = {
  serverWorkspaceCount: number;
  workspacePaths: string[];
};

function readManifest(filePath: string): PackageManifest {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object.`);
  }

  return parsed as PackageManifest;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function expandWorkspacePattern(repoRoot: string, pattern: string): string[] {
  const normalizedPattern = toPosixPath(pattern).replace(/\/+$/u, '');
  const segments = normalizedPattern.split('/').filter(Boolean);
  const matches: string[] = [];

  const visit = (absoluteDir: string, segmentIndex: number): void => {
    if (segmentIndex === segments.length) {
      if (existsSync(path.join(absoluteDir, 'package.json'))) {
        matches.push(toPosixPath(path.relative(repoRoot, absoluteDir)));
      }
      return;
    }

    const segment = segments[segmentIndex];
    if (!segment) {
      return;
    }

    if (segment === '*') {
      if (!existsSync(absoluteDir)) {
        return;
      }

      for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          visit(path.join(absoluteDir, entry.name), segmentIndex + 1);
        }
      }
      return;
    }

    if (segment.includes('*')) {
      throw new Error(
        `Unsupported workspace pattern "${pattern}". Wildcards must occupy a full path segment.`,
      );
    }

    visit(path.join(absoluteDir, segment), segmentIndex + 1);
  };

  visit(repoRoot, 0);
  return matches;
}

function discoverWorkspaces(
  repoRoot: string,
  rootManifest: PackageManifest,
): WorkspaceManifest[] {
  if (!Array.isArray(rootManifest.workspaces)) {
    throw new Error('Root package.json must declare a workspaces array.');
  }

  const workspacePaths = [
    ...new Set(
      rootManifest.workspaces.flatMap((pattern) =>
        expandWorkspacePattern(repoRoot, pattern),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return workspacePaths.map((workspacePath) => ({
    manifest: readManifest(path.join(repoRoot, workspacePath, 'package.json')),
    path: workspacePath,
  }));
}

function indexWorkspacesByName(
  workspaces: WorkspaceManifest[],
): Map<string, WorkspaceManifest> {
  const workspaceByName = new Map<string, WorkspaceManifest>();

  for (const workspace of workspaces) {
    const packageName = workspace.manifest.name;
    if (!packageName) {
      throw new Error(`${workspace.path}/package.json is missing "name".`);
    }

    const existing = workspaceByName.get(packageName);
    if (existing) {
      throw new Error(
        `Duplicate workspace package name "${packageName}" in ${existing.path} and ${workspace.path}.`,
      );
    }

    workspaceByName.set(packageName, workspace);
  }

  return workspaceByName;
}

function collectLocalDependencies(
  manifest: PackageManifest,
  manifestPath: string,
  workspaceByName: Map<string, WorkspaceManifest>,
): WorkspaceManifest[] {
  const localDependencies: WorkspaceManifest[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    for (const [packageName, version] of Object.entries(
      manifest[section] ?? {},
    )) {
      const workspace = workspaceByName.get(packageName);
      if (workspace) {
        localDependencies.push(workspace);
        continue;
      }

      if (version.startsWith('workspace:')) {
        throw new Error(
          `${manifestPath}: ${section}.${packageName} references a missing workspace package.`,
        );
      }
    }
  }

  return localDependencies;
}

export function resolveServerWorkspaceClosure(
  repoRoot: string,
  seedWorkspacePaths: string[] = [],
): PrepareServerWorkspaceResult {
  const rootManifestPath = path.join(repoRoot, 'package.json');
  const rootManifest = readManifest(rootManifestPath);
  const workspaces = discoverWorkspaces(repoRoot, rootManifest);
  const workspaceByName = indexWorkspacesByName(workspaces);
  const serverWorkspaces = workspaces.filter((workspace) =>
    workspace.path.startsWith(SERVER_WORKSPACE_PREFIX),
  );
  const workspaceByPath = new Map(
    workspaces.map((workspace) => [workspace.path, workspace]),
  );

  if (serverWorkspaces.length === 0) {
    throw new Error('No apps/server/* workspaces were discovered.');
  }

  const selectedByPath = new Map<string, WorkspaceManifest>();
  const pending: WorkspaceManifest[] = [];
  const select = (workspace: WorkspaceManifest): void => {
    if (selectedByPath.has(workspace.path)) {
      return;
    }

    selectedByPath.set(workspace.path, workspace);
    pending.push(workspace);
  };

  for (const workspace of serverWorkspaces) {
    select(workspace);
  }

  for (const seedWorkspacePath of seedWorkspacePaths) {
    const normalizedSeedPath = toPosixPath(seedWorkspacePath).replace(
      /\/+$/u,
      '',
    );
    const workspace = workspaceByPath.get(normalizedSeedPath);
    if (!workspace) {
      throw new Error(
        `Server-image seed workspace "${seedWorkspacePath}" was not found in the root workspace graph.`,
      );
    }

    select(workspace);
  }

  for (const dependency of collectLocalDependencies(
    rootManifest,
    'package.json',
    workspaceByName,
  )) {
    select(dependency);
  }

  while (pending.length > 0) {
    const workspace = pending.shift();
    if (!workspace) {
      continue;
    }

    for (const dependency of collectLocalDependencies(
      workspace.manifest,
      `${workspace.path}/package.json`,
      workspaceByName,
    )) {
      select(dependency);
    }
  }

  return {
    serverWorkspaceCount: serverWorkspaces.length,
    workspacePaths: [...selectedByPath.keys()].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function prepareRootManifest(
  rootManifest: PackageManifest,
  workspacePaths: string[],
): PackageManifest {
  const preparedManifest: PackageManifest = {
    ...rootManifest,
    workspaces: workspacePaths,
  };

  if (preparedManifest.scripts) {
    preparedManifest.scripts = { ...preparedManifest.scripts };
    delete preparedManifest.scripts.postinstall;
  }

  if (preparedManifest.dependencies?.resend === '^6.9.3') {
    preparedManifest.dependencies = {
      ...preparedManifest.dependencies,
      resend: '6.9.3',
    };
  }

  return preparedManifest;
}

export function prepareServerWorkspace(
  options: PrepareServerWorkspaceOptions,
): PrepareServerWorkspaceResult {
  const repoRoot = path.resolve(options.repoRoot);
  const outputRoot = path.resolve(options.outputRoot);

  if (repoRoot === outputRoot) {
    throw new Error('Output root must differ from the source repository root.');
  }

  const result = resolveServerWorkspaceClosure(
    repoRoot,
    options.seedWorkspacePaths,
  );
  const rootManifest = readManifest(path.join(repoRoot, 'package.json'));
  const preparedRootManifest = prepareRootManifest(
    rootManifest,
    result.workspacePaths,
  );

  mkdirSync(outputRoot, { recursive: true });
  for (const workspaceRoot of ['apps/server', 'packages', 'ee/packages']) {
    mkdirSync(path.join(outputRoot, workspaceRoot), { recursive: true });
  }

  writeFileSync(
    path.join(outputRoot, 'package.json'),
    `${JSON.stringify(preparedRootManifest, null, 2)}\n`,
    'utf8',
  );

  for (const workspacePath of result.workspacePaths) {
    const outputDir = path.join(outputRoot, workspacePath);
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(
      path.join(repoRoot, workspacePath, 'package.json'),
      path.join(outputDir, 'package.json'),
    );
  }

  return result;
}

function parseArgs(argv: string[]): PrepareServerWorkspaceOptions {
  const args: Partial<PrepareServerWorkspaceOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--repo-root' && next) {
      args.repoRoot = next;
      index += 1;
      continue;
    }

    if (current === '--output-root' && next) {
      args.outputRoot = next;
      index += 1;
      continue;
    }

    if (current === '--seed-workspace' && next) {
      args.seedWorkspacePaths = [
        ...(args.seedWorkspacePaths ?? []),
        next,
      ];
      index += 1;
    }
  }

  if (!args.repoRoot || !args.outputRoot) {
    throw new Error(
      'Usage: bun scripts/docker/prepare-server-workspace.ts --repo-root <path> --output-root <path> [--seed-workspace <path>]',
    );
  }

  return {
    outputRoot: args.outputRoot,
    repoRoot: args.repoRoot,
    seedWorkspacePaths: args.seedWorkspacePaths,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return (
    Boolean(entryPoint) &&
    path.resolve(entryPoint) === path.resolve(fileURLToPath(import.meta.url))
  );
}

if (isMainModule()) {
  const result = prepareServerWorkspace(parseArgs(process.argv.slice(2)));
  console.log(
    `Prepared ${result.workspacePaths.length} server-image workspaces from ${result.serverWorkspaceCount} apps/server seeds.`,
  );
}
