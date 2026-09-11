import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const ROOT_TSCONFIG = path.join(ROOT_DIR, 'tsconfig.json');
const BASELINE_FILE = path.join(ROOT_DIR, 'scripts/import-cycle-baseline.json');
// Generated clients (Prisma, OpenAPI types) have intentional internal cycles.
const EXCLUDE_REGEX = String.raw`(^|/)(node_modules|dist|coverage|storybook-static|public|docs|e2e|__tests__|__mocks__|\.next|generated)(/|$)|\.(spec|test)\.[jt]sx?$|\.d\.ts$`;
const WORKSPACE_GLOBS = ['packages/*', 'apps/server/*', 'apps/app/*'];
// Type-only interface barrels produce noisy Madge cycles with no runtime edge.
// The tree sits inside the scanned contracts workspace, so it is matched per
// cycle rather than per workspace.
const EXCLUDED_CYCLE_PATH_PREFIXES = ['packages/contracts/src/interfaces/'];
const CODE_DIR_HINTS = ['src', 'app', 'packages', 'components', 'lib'];
// A safety net against a hung madge process, not a performance budget:
// apps/server/api alone runs past 60s on a 4-vCPU CI runner. The whole check
// still has to fit the 150s executable-contract child timeout.
const DEFAULT_MADGE_TIMEOUT_MS = 120_000;
// Workspaces scan in parallel so the full check fits the CI contract timeout.
const MAX_MADGE_CONCURRENCY = 4;
const SOURCE_FILE_PATTERN = '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

type CliArgs = {
  files: string[];
  json: boolean;
  timeoutMs: number;
  updateBaseline: boolean;
};

type CycleRecord = {
  key: string;
  files: string[];
  workspace: string;
};

type BaselineData = {
  version: number;
  cycles: CycleRecord[];
};

type JsonReport = {
  scannedWorkspaces: string[];
  detectedCount: number;
  baselinedCount: number;
  newCycles: CycleRecord[];
};

function parseArgs(argv: string[]): CliArgs {
  const files: string[] = [];
  let json = false;
  let timeoutMs = DEFAULT_MADGE_TIMEOUT_MS;
  let updateBaseline = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }

    if (arg === '--timeout-ms') {
      const rawTimeout = argv[index + 1];
      if (!rawTimeout || rawTimeout.startsWith('--')) {
        throw new Error('--timeout-ms requires a numeric value');
      }
      const parsedTimeout = Number(rawTimeout);
      if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
        throw new Error('--timeout-ms must be a positive number');
      }
      timeoutMs = parsedTimeout;
      index += 1;
      continue;
    }

    if (arg === '--files') {
      for (let nextIndex = index + 1; nextIndex < argv.length; nextIndex += 1) {
        const nextArg = argv[nextIndex];
        if (nextArg.startsWith('--')) {
          break;
        }
        files.push(nextArg);
        index = nextIndex;
      }
    }
  }

  return { files, json, timeoutMs, updateBaseline };
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function toRepoRelative(value: string): string {
  const absoluteValue = path.isAbsolute(value)
    ? value
    : path.resolve(ROOT_DIR, value);
  return toPosixPath(path.relative(ROOT_DIR, absoluteValue));
}

function hasCodeTree(workspaceRoot: string): boolean {
  if (CODE_DIR_HINTS.some((dir) => existsSync(path.join(workspaceRoot, dir)))) {
    return true;
  }

  return (
    Array.from(
      new Bun.Glob(`**/${SOURCE_FILE_PATTERN}`).scanSync({
        cwd: workspaceRoot,
        absolute: false,
      }),
    ).filter((file) => !new RegExp(EXCLUDE_REGEX).test(file)).length > 0
  );
}

function discoverScanTargets(workspaceRoot: string): string[] {
  const hintedTargets = CODE_DIR_HINTS.map((dir) =>
    path.join(workspaceRoot, dir),
  ).filter((candidatePath) => {
    try {
      return existsSync(candidatePath) && statSync(candidatePath).isDirectory();
    } catch {
      return false;
    }
  });

  if (hintedTargets.length > 0) {
    return hintedTargets;
  }

  const codeFiles = Array.from(
    new Bun.Glob(`**/${SOURCE_FILE_PATTERN}`).scanSync({
      cwd: workspaceRoot,
      absolute: false,
    }),
  ).filter((file) => !new RegExp(EXCLUDE_REGEX).test(file));

  const topLevelDirs = new Set<string>();
  const rootFiles: string[] = [];

  for (const file of codeFiles) {
    const [firstSegment] = toPosixPath(file).split('/');
    if (!firstSegment) {
      continue;
    }
    if (firstSegment === file) {
      rootFiles.push(path.join(workspaceRoot, file));
    } else {
      topLevelDirs.add(path.join(workspaceRoot, firstSegment));
    }
  }

  return [...topLevelDirs, ...rootFiles].sort((left, right) =>
    left.localeCompare(right),
  );
}

function expandWorkspacePattern(pattern: string): string[] {
  const [baseDir] = pattern.split('/*');
  if (!baseDir || !existsSync(path.join(ROOT_DIR, baseDir))) {
    return [];
  }

  return readdirSync(path.join(ROOT_DIR, baseDir))
    .map((entry) => path.join(ROOT_DIR, baseDir, entry))
    .filter((candidatePath) => {
      try {
        return statSync(candidatePath).isDirectory();
      } catch {
        return false;
      }
    });
}

function discoverWorkspaceRoots(): string[] {
  const excludedPath = new RegExp(EXCLUDE_REGEX);

  // Workspace globs also match build output such as apps/app/.next and
  // apps/server/dist once a build or typecheck has run.
  return WORKSPACE_GLOBS.flatMap((pattern) => expandWorkspacePattern(pattern))
    .filter(
      (workspaceRoot) => !excludedPath.test(toRepoRelative(workspaceRoot)),
    )
    .filter((workspaceRoot) => hasCodeTree(workspaceRoot))
    .sort((left, right) => left.localeCompare(right));
}

function mapFilesToWorkspaceRoots(
  files: string[],
  workspaceRoots: string[],
): string[] {
  if (files.length === 0) {
    return workspaceRoots;
  }

  const workspacePrefixes = workspaceRoots.map((workspaceRoot) => ({
    absolutePath: workspaceRoot,
    relativePath: `${toRepoRelative(workspaceRoot)}/`,
  }));

  const selectedRoots = new Set<string>();

  for (const file of files) {
    const normalizedFile = toPosixPath(file);

    for (const workspace of workspacePrefixes) {
      if (
        normalizedFile === workspace.relativePath.slice(0, -1) ||
        normalizedFile.startsWith(workspace.relativePath)
      ) {
        selectedRoots.add(workspace.absolutePath);
      }
    }
  }

  return [...selectedRoots].sort((left, right) => left.localeCompare(right));
}

function resolveTsconfig(workspaceRoot: string): string {
  const preferredConfigs = ['tsconfig.json', 'tsconfig.app.json'];

  for (const configName of preferredConfigs) {
    const candidatePath = path.join(workspaceRoot, configName);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return ROOT_TSCONFIG;
}

async function runMadge(
  workspaceRoot: string,
  tsconfigPath: string,
  scanTargets: string[],
  timeoutMs: number,
): Promise<string[][]> {
  if (scanTargets.length === 0) {
    return [];
  }

  const workspace = toRepoRelative(workspaceRoot);
  const child = Bun.spawn(
    [
      'bunx',
      'madge',
      '--json',
      '--circular',
      '--extensions',
      'ts,tsx',
      '--ts-config',
      tsconfigPath,
      '--exclude',
      EXCLUDE_REGEX,
      ...scanTargets,
    ],
    { cwd: ROOT_DIR, stderr: 'pipe', stdin: 'ignore', stdout: 'pipe' },
  );
  let isTimedOut = false;
  const timer = setTimeout(() => {
    isTimedOut = true;
    child.kill();
  }, timeoutMs);

  const [stdout, stderr, exitStatus] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timer));

  if (isTimedOut) {
    throw new Error(
      `madge timed out after ${timeoutMs}ms while scanning ${workspace}`,
    );
  }

  if (exitStatus !== 0 && exitStatus !== 1) {
    const trimmedStderr = stderr.trim();
    throw new Error(
      `${workspace}: ${trimmedStderr.length > 0 ? trimmedStderr : 'madge execution failed'}`,
    );
  }

  const rawOutput = stdout.trim();
  if (rawOutput.length === 0) {
    return [];
  }

  const parsed = JSON.parse(rawOutput) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${workspace}: madge returned an unexpected JSON payload`);
  }

  return parsed.filter((entry): entry is string[] => Array.isArray(entry));
}

/**
 * Madge prints cycle files relative to the common directory of its scan
 * targets, so a workspace scanned through `src` reports `ui/x.ts`, not
 * `src/ui/x.ts`.
 */
function resolveMadgeBaseDir(scanTargets: string[]): string {
  const [firstTarget, ...otherTargets] = scanTargets.map((target) =>
    statSync(target).isDirectory() ? target : path.dirname(target),
  );
  let baseDir = firstTarget;

  for (const target of otherTargets) {
    while (target !== baseDir && !target.startsWith(`${baseDir}${path.sep}`)) {
      baseDir = path.dirname(baseDir);
    }
  }

  return baseDir;
}

function normalizeCycleFiles(rawFiles: string[], baseDir: string): string[] {
  const baseRelativePath = toRepoRelative(baseDir);

  return rawFiles.map((file) => {
    if (path.isAbsolute(file)) {
      return toRepoRelative(file);
    }

    const normalizedFile = toPosixPath(file);
    return path.posix.normalize(
      path.posix.join(baseRelativePath, normalizedFile),
    );
  });
}

function resolveWorkspaceFromFile(file: string): string | null {
  const match = /^(packages\/[^/]+|apps\/server\/[^/]+|apps\/app\/[^/]+)/.exec(
    file,
  );
  return match?.[1] ?? null;
}

function rotate<T>(items: T[], startIndex: number): T[] {
  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
}

function compareArrays(left: string[], right: string[]): number {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? '';
    const rightValue = right[index] ?? '';
    const comparison = leftValue.localeCompare(rightValue);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function canonicalizeCycle(files: string[]): string[] {
  if (files.length <= 1) {
    return [...files];
  }

  const candidates: string[][] = [];
  const forward = [...files];
  const reversed = [...files].reverse();

  for (let index = 0; index < files.length; index += 1) {
    candidates.push(rotate(forward, index));
    candidates.push(rotate(reversed, index));
  }

  candidates.sort(compareArrays);
  return candidates[0];
}

function toCycleRecord(
  files: string[],
  workspaceRoot: string,
  baseDir: string,
): CycleRecord {
  const normalizedFiles = normalizeCycleFiles(files, baseDir);
  const canonicalFiles = canonicalizeCycle(normalizedFiles);
  const resolvedWorkspace =
    resolveWorkspaceFromFile(canonicalFiles[0]) ??
    toRepoRelative(workspaceRoot);

  return {
    files: canonicalFiles,
    key: canonicalFiles.join(' -> '),
    workspace: resolvedWorkspace,
  };
}

function isExcludedCycle(cycle: CycleRecord): boolean {
  return cycle.files.every((file) =>
    EXCLUDED_CYCLE_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)),
  );
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function drain(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => drain()),
  );
  return results;
}

function readBaseline(): BaselineData {
  if (!existsSync(BASELINE_FILE)) {
    return { cycles: [], version: 1 };
  }

  const parsed = JSON.parse(
    readFileSync(BASELINE_FILE, 'utf8'),
  ) as Partial<BaselineData>;
  return {
    cycles: Array.isArray(parsed.cycles) ? parsed.cycles : [],
    version: parsed.version ?? 1,
  };
}

function writeBaseline(cycles: CycleRecord[]): void {
  const sortedCycles = [
    ...new Map(cycles.map((cycle) => [cycle.key, cycle])).values(),
  ].sort((left, right) => left.key.localeCompare(right.key));

  const payload: BaselineData = {
    cycles: sortedCycles,
    version: 1,
  };

  writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printTextReport(
  scannedWorkspaces: string[],
  detectedCycles: CycleRecord[],
  baselinedCount: number,
  newCycles: CycleRecord[],
): void {
  process.stdout.write('Import Cycle Check\n');
  process.stdout.write(`  Workspaces scanned: ${scannedWorkspaces.length}\n`);
  process.stdout.write(`  Cycles detected:    ${detectedCycles.length}\n`);
  process.stdout.write(`  Baselined cycles:   ${baselinedCount}\n`);
  process.stdout.write(`  New cycles:         ${newCycles.length}\n`);

  if (newCycles.length === 0) {
    process.stdout.write('  No new import cycles found.\n');
    return;
  }

  process.stdout.write('\nNew import cycles:\n');
  for (const cycle of newCycles) {
    process.stdout.write(`\n- ${cycle.workspace}\n`);
    for (const file of cycle.files) {
      process.stdout.write(`    ${file}\n`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allWorkspaceRoots = discoverWorkspaceRoots();
  const workspaceRoots = mapFilesToWorkspaceRoots(
    args.files,
    allWorkspaceRoots,
  );

  if (workspaceRoots.length === 0) {
    if (args.json) {
      const emptyReport: JsonReport = {
        baselinedCount: 0,
        detectedCount: 0,
        newCycles: [],
        scannedWorkspaces: [],
      };
      process.stdout.write(`${JSON.stringify(emptyReport, null, 2)}\n`);
    } else {
      process.stdout.write('Import Cycle Check\n');
      process.stdout.write('  No matching workspaces to scan.\n');
    }
    process.exit(0);
  }

  const concurrency = Math.min(MAX_MADGE_CONCURRENCY, availableParallelism());
  const cyclesByWorkspace = await mapWithConcurrency(
    workspaceRoots,
    concurrency,
    async (workspaceRoot) => {
      const tsconfigPath = resolveTsconfig(workspaceRoot);
      const scanTargets = discoverScanTargets(workspaceRoot);
      if (scanTargets.length === 0) {
        return [];
      }
      if (!args.json) {
        process.stdout.write(
          `Scanning ${toRepoRelative(workspaceRoot)} (${scanTargets
            .map((target) => toRepoRelative(target))
            .join(', ')})...\n`,
        );
      }
      const baseDir = resolveMadgeBaseDir(scanTargets);
      const cycles = await runMadge(
        workspaceRoot,
        tsconfigPath,
        scanTargets,
        args.timeoutMs,
      );
      return cycles.map((cycleFiles) =>
        toCycleRecord(cycleFiles, workspaceRoot, baseDir),
      );
    },
  );
  const detectedCycles = cyclesByWorkspace
    .flat()
    .filter((cycle) => !isExcludedCycle(cycle));

  const dedupedCycles = [
    ...new Map(detectedCycles.map((cycle) => [cycle.key, cycle])).values(),
  ].sort((left, right) => left.key.localeCompare(right.key));

  if (args.updateBaseline) {
    const existingBaseline = readBaseline();
    const scannedWorkspaceSet = new Set(
      workspaceRoots.map((workspaceRoot) => toRepoRelative(workspaceRoot)),
    );
    const retainedCycles = existingBaseline.cycles.filter(
      (cycle) => !scannedWorkspaceSet.has(cycle.workspace),
    );
    writeBaseline([...retainedCycles, ...dedupedCycles]);
    process.stdout.write(
      `Updated import cycle baseline for ${workspaceRoots.length} workspace(s) with ${dedupedCycles.length} cycle(s).\n`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  const baselineKeys = new Set(baseline.cycles.map((cycle) => cycle.key));
  const newCycles = dedupedCycles.filter(
    (cycle) => !baselineKeys.has(cycle.key),
  );
  const baselinedCount = dedupedCycles.length - newCycles.length;
  const scannedWorkspaces = workspaceRoots.map((workspaceRoot) =>
    toRepoRelative(workspaceRoot),
  );

  if (args.json) {
    const report: JsonReport = {
      baselinedCount,
      detectedCount: dedupedCycles.length,
      newCycles,
      scannedWorkspaces,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printTextReport(
      scannedWorkspaces,
      dedupedCycles,
      baselinedCount,
      newCycles,
    );
  }

  process.exit(newCycles.length > 0 ? 1 : 0);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Import cycle check failed: ${message}\n`);
  process.exit(1);
});
