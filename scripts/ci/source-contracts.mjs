#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseVitestList } from './pr-test-plan.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SURFACES = [
  { directory: 'apps/app', config: 'vitest.config.mts' },
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
      /\bBun\s*\.\s*(?:file|Glob)\b/.test(source),
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
    /(?:^|\/)(?:test|tests|__tests__|testing|test-utils|fixtures)(?:\/|\.)/.test(
      file,
    ) ||
    /(?:^|\/)(?:test[-.]?(?:helpers?|utils?)|source[-.]?(?:reader|contracts?)|[^/]+\.(?:test-utils|test-helpers|fixtures))\.[cm]?[jt]sx?$/.test(
      file,
    )
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

export function runSourceContracts({ listOnly = false } = {}) {
  const results = [];
  for (const surface of SURFACES) {
    const directory = path.join(ROOT, surface.directory);
    const files = discoverSourceContracts(surface);
    const relativeFiles = files.map((file) => path.relative(directory, file));
    results.push({ surface: surface.directory, files: relativeFiles });
    if (!listOnly && files.length) {
      console.log(
        `Running ${files.length} filesystem source contracts in ${surface.directory}`,
      );
      execFileSync(
        'bunx',
        [
          'vitest',
          'run',
          '--config',
          surface.config,
          '--maxWorkers=2',
          ...relativeFiles,
        ],
        {
          cwd: directory,
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
        },
      );
    }
  }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--list'))
    throw new Error('Only --list is supported');
  const results = runSourceContracts({ listOnly: args.includes('--list') });
  if (args.includes('--list')) console.log(JSON.stringify(results, null, 2));
}
