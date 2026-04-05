import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ROOT_DIR = process.cwd();
const ROOT_TSCONFIG = path.join(ROOT_DIR, 'tsconfig.json');
const BASELINE_FILE = path.join(ROOT_DIR, 'scripts/import-cycle-baseline.json');
const EXCLUDE_REGEX = String.raw`(^|/)(node_modules|dist|coverage|storybook-static|public|docs|e2e|__tests__|__mocks__|\.next)(/|$)|\.(spec|test)\.[jt]sx?$|\.d\.ts$`;
const WORKSPACE_GLOBS = ['packages/*', 'apps/server/*', 'apps/app/*'];
const CODE_DIR_HINTS = ['src', 'app', 'packages', 'components', 'lib'];

type CliArgs = {
  files: string[];
  json: boolean;
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

  return { files, json, updateBaseline };
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
    globSync('*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', {
      absolute: false,
      cwd: workspaceRoot,
      nodir: true,
    }).length > 0
  );
}

function discoverWorkspaceRoots(): string[] {
  return WORKSPACE_GLOBS.flatMap((pattern) =>
    globSync(pattern, {
      absolute: true,
      cwd: ROOT_DIR,
      onlyDirectories: true,
    }),
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

function runMadge(workspaceRoot: string, tsconfigPath: string): string[][] {
  const commandArgs = [
    '--yes',
    'madge@8',
    '--json',
    '--circular',
    '--extensions',
    'ts,tsx',
    '--ts-config',
    tsconfigPath,
    '--exclude',
    EXCLUDE_REGEX,
    workspaceRoot,
  ];

  const result = spawnSync('npx', commandArgs, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const exitStatus = result.status ?? 1;
  if (exitStatus !== 0 && exitStatus !== 1) {
    const stderr = result.stderr.trim();
    throw new Error(stderr.length > 0 ? stderr : 'madge execution failed');
  }

  const rawOutput = result.stdout.trim();
  if (rawOutput.length === 0) {
    return [];
  }

  const parsed = JSON.parse(rawOutput) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('madge returned an unexpected JSON payload');
  }

  return parsed.filter((entry): entry is string[] => Array.isArray(entry));
}

function normalizeCycleFiles(
  rawFiles: string[],
  workspaceRoot: string,
): string[] {
  const workspaceRelativePath = toRepoRelative(workspaceRoot);

  return rawFiles.map((file) => {
    if (path.isAbsolute(file)) {
      return toRepoRelative(file);
    }

    const normalizedFile = toPosixPath(file);
    if (
      normalizedFile.startsWith(`${workspaceRelativePath}/`) ||
      normalizedFile === workspaceRelativePath
    ) {
      return normalizedFile;
    }

    return path.posix.normalize(
      path.posix.join(workspaceRelativePath, normalizedFile),
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

function toCycleRecord(files: string[], workspaceRoot: string): CycleRecord {
  const normalizedFiles = normalizeCycleFiles(files, workspaceRoot);
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

  const detectedCycles = workspaceRoots.flatMap((workspaceRoot) => {
    const tsconfigPath = resolveTsconfig(workspaceRoot);
    const cycles = runMadge(workspaceRoot, tsconfigPath);
    return cycles.map((cycleFiles) => toCycleRecord(cycleFiles, workspaceRoot));
  });

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
