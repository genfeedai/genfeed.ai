#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseVitestList } from './pr-test-plan.mjs';

const BUN_FILE_API_PATTERN = /\bBun\s*\.\s*(?:file|Glob)\b/;
const TEST_SUPPORT_DIRECTORY_PATTERN =
  /(?:^|\/)(?:test|tests|__tests__|testing|test-utils|fixtures)(?:\/|\.)/;
const TEST_SUPPORT_FILE_PATTERN =
  /(?:^|\/)(?:test[-.]?(?:helpers?|utils?)|source[-.]?(?:reader|contracts?)|[^/]+\.(?:test-utils|test-helpers|fixtures))\.[cm]?[jt]sx?$/;

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// Files in `domFiles` render components and need jsdom plus the DOM setup. The
// rest of a surface that names a `nodeConfig` runs there, without a DOM: creating
// jsdom for each of 223 web files took about 160 s (#10271).
export const WEB_DOM_SOURCE_CONTRACT_FILES = Object.freeze([
  'app/(onboarding)/layout.test.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/messages/page.test.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/batches/[approvalId]/page.test.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/content/page.test.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/posts/[id]/page.test.tsx',
  'app/(protected)/[orgSlug]/~/messages/page.test.tsx',
  'src/components/workspace-shell/WorkspaceContextSidebar.test.tsx',
  'src/features/articles/analytics/article-traffic-panel.test.tsx',
  'src/features/articles/list/articles-list.test.tsx',
  'src/features/posts/library/publishing-post-hover-preview.test.tsx',
  'src/features/posts/list/release-posts-list.test.tsx',
  'src/features/trainings/list/trainings-list.test.tsx',
  'src/features/workflows/components/schedule/WorkflowScheduleDialog.test.tsx',
]);

const SURFACES = [
  {
    directory: 'apps/web',
    config: 'vitest.config.mts',
    nodeConfig: 'vitest.source-contracts.config.mts',
    domFiles: WEB_DOM_SOURCE_CONTRACT_FILES,
  },
  { directory: 'apps/server/api', config: 'vitest.config.ts' },
];
const FS_MODULES = new Set([
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'fs-extra',
  'graceful-fs',
]);

// These readers exercise real PostgreSQL/Redis behavior. The existing API
// test job owns their execution and fixtures; Static still traverses their
// entire source graph before classifying the selected roots below.
export const CONNECTED_SOURCE_CONTRACT_FILES = Object.freeze([
  'apps/server/api/src/services/integrations/crun/crun-image-flow.integration.spec.ts',
  'apps/server/api/src/services/integrations/crun/crun-video-flow.integration.spec.ts',
  'apps/server/api/src/services/integrations/crun/crun-task.postgres.spec.ts',
  'apps/server/api/src/authorization/brand-access/brand-access.postgres.spec.ts',
]);

export function partitionSourceContracts(files, root = ROOT) {
  const connectedPaths = new Set(CONNECTED_SOURCE_CONTRACT_FILES);
  const sourceOnly = [],
    connected = [];
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    (connectedPaths.has(relative) ? connected : sourceOnly).push(file);
  }
  return { sourceOnly, connected };
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/** Dependencies are parsed, never evaluated: require(), dynamic import(), and
 * re-exported test helpers are included without importing application services. */
export function sourceImports(source) {
  const imports = ts
    .preProcessFile(source, true, true)
    .importedFiles.map((entry) => entry.fileName);
  return {
    filesystem:
      imports.some((name) => FS_MODULES.has(name)) ||
      BUN_FILE_API_PATTERN.test(source),
    imports,
  };
}

export function selectSourceContracts(files, { readSource, resolveImport }) {
  const graph = new Map();
  const queue = [...files];
  const readers = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (graph.has(file)) continue;
    const scanned = sourceImports(readSource(file));
    const dependencies = scanned.imports
      .map((specifier) => resolveImport(specifier, file))
      .filter(Boolean);
    graph.set(file, dependencies);
    if (scanned.filesystem) readers.add(file);
    queue.push(...dependencies.filter((dependency) => !graph.has(dependency)));
  }
  // Fixed point rather than recursive boolean memoization: cycles can reach a
  // reader through a later edge, so an early false would drop a valid contract.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, dependencies] of graph) {
      if (
        !readers.has(file) &&
        dependencies.some((dependency) => readers.has(dependency))
      ) {
        readers.add(file);
        changed = true;
      }
    }
  }
  return [...new Set(files)].filter((file) => readers.has(file)).sort();
}

// Traverse test support, not application imports: product dependencies already
// belong to Vitest's graph; expanding through server config would select most
// API unit tests simply because configuration itself reads the filesystem.
export function isTestSupport(file) {
  return (
    TEST_SUPPORT_DIRECTORY_PATTERN.test(file) ||
    TEST_SUPPORT_FILE_PATTERN.test(file)
  );
}

export function createResolver(directory, root = ROOT) {
  const configPath = ts.findConfigFile(directory, ts.sys.fileExists);
  if (!configPath) throw new Error(`Missing tsconfig for ${directory}`);
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      // Resolution needs compiler options (including extends/paths), not a scan
      // of every included source file.
      readDirectory: () => [],
      onUnRecoverableConfigFileDiagnostic: (error) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        );
      },
    },
  );
  if (!config) throw new Error(`Cannot read ${configPath}`);
  const errors = config.errors.filter((error) => error.code !== 18003);
  if (errors.length)
    throw new Error(
      errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        )
        .join('\n'),
    );
  const cache = ts.createModuleResolutionCache(
    directory,
    (file) => file,
    config.options,
  );
  return (specifier, importer) => {
    if (FS_MODULES.has(specifier) || specifier.startsWith('node:'))
      return undefined;
    const resolved = ts.resolveModuleName(
      specifier,
      importer,
      config.options,
      ts.sys,
      cache,
    ).resolvedModule?.resolvedFileName;
    if (
      !resolved ||
      !inside(root, resolved) ||
      resolved.includes('/node_modules/') ||
      resolved.endsWith('.d.ts') ||
      !isTestSupport(resolved)
    )
      return undefined;
    return resolved;
  };
}

export function discoverSourceContracts(surface, root = ROOT) {
  const directory = path.join(root, surface.directory);
  // Vitest is authoritative for include/exclude and unit-project eligibility.
  // Never pass --changed: source-only product edits are absent from its graph.
  const raw = execFileSync(
    'bunx',
    [
      'vitest',
      'list',
      '--config',
      surface.config,
      '--filesOnly',
      '--json',
      '--no-color',
      '--staticParse',
    ],
    {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
    },
  );
  const files = parseVitestList(raw, root).map((file) => path.join(root, file));
  return selectSourceContracts(files, {
    readSource: (file) => readFileSync(file, 'utf8'),
    resolveImport: createResolver(directory, root),
  });
}

function executeVitest(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Source contracts in ${options.cwd} failed (${signal ?? code})`,
          ),
        );
    });
  });
}

export async function runSourceContracts({
  listOnly = false,
  root = ROOT,
  surfaces = SURFACES,
  discover = discoverSourceContracts,
  execute = executeVitest,
} = {}) {
  const results = [];
  const executions = [];
  for (const surface of surfaces) {
    const directory = path.join(root, surface.directory);
    const discovered = discover(surface, root);
    const { sourceOnly: files, connected } =
      partitionSourceContracts(discovered);
    const relativeFiles = files.map((file) => path.relative(directory, file));
    results.push({
      surface: surface.directory,
      files: relativeFiles,
      connectedFiles: connected.map((file) => path.relative(directory, file)),
    });
    if (!listOnly && connected.length)
      console.log(
        `Retaining ${connected.length} connected source contracts in the API test job`,
      );
    if (!listOnly && files.length) {
      console.log(
        `Running ${files.length} filesystem source contracts in ${surface.directory}`,
      );
      // Two surfaces, two workers each: a bounded four-worker pool fits the
      // 4-vCPU Linux runner. Keep each original cwd and per-file isolation.
      // Selection is unconditional: imports cannot see filesystem reads.
      const domFiles = new Set(surface.domFiles ?? []);
      const groups = surface.nodeConfig
        ? [
            {
              config: surface.nodeConfig,
              files: relativeFiles.filter((file) => !domFiles.has(file)),
            },
            {
              config: surface.config,
              files: relativeFiles.filter((file) => domFiles.has(file)),
            },
          ]
        : [{ config: surface.config, files: relativeFiles }];
      // One chain per surface: its groups run one after the other so the
      // surfaces together stay within four workers.
      executions.push(
        groups
          .filter((group) => group.files.length)
          .map((group) => ({
            command: 'bunx',
            args: [
              'vitest',
              'run',
              '--config',
              group.config,
              '--maxWorkers=2',
              ...group.files,
            ],
            options: {
              cwd: directory,
              env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
            },
          })),
      );
    }
  }
  const settled = await Promise.allSettled(
    executions.map(async (chain) => {
      const errors = [];
      for (const { command, args, options } of chain) {
        try {
          await execute(command, args, options);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length)
        throw new AggregateError(errors, 'Source contracts failed');
    }),
  );
  const failures = settled
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(failures, 'Filesystem source contracts failed');
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--list'))
    throw new Error('Only --list is supported');
  const results = await runSourceContracts({
    listOnly: args.includes('--list'),
  });
  if (args.includes('--list')) console.log(JSON.stringify(results, null, 2));
}
