import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { globSync } from 'glob';

export type NightlyTestWorkspaceClass =
  | 'api'
  | 'app'
  | 'client'
  | 'extension'
  | 'package'
  | 'server-service';

export type NightlyTestWorkspace = {
  command: string;
  manifestCommand: string;
  name: string;
  path: string;
  workspaceClass: NightlyTestWorkspaceClass;
};

export type NightlyTestExclusion = {
  owner: string;
  path: string;
  reason: string;
  reviewDate: string;
  trackingIssue: number;
};

export type NightlyTestInventoryViolation = {
  kind:
    | 'duplicate-exclusion'
    | 'duplicate-workspace'
    | 'duplicate-workspace-name'
    | 'expired-exclusion'
    | 'invalid-command'
    | 'invalid-exclusion'
    | 'invalid-workspace-manifest'
    | 'missing-workspace-classification'
    | 'stale-exclusion';
  message: string;
  path: string;
};

export type NightlyTestInventoryResult = {
  excluded: NightlyTestExclusion[];
  summary: {
    byClass: Record<NightlyTestWorkspaceClass, number>;
    discoveredWorkspaces: number;
    excludedWorkspaces: number;
    executableWorkspaces: number;
    testCapableWorkspaces: number;
  };
  violations: NightlyTestInventoryViolation[];
  workspaces: NightlyTestWorkspace[];
};

export type NightlyTestInventoryOptions = {
  exclusions?: readonly NightlyTestExclusion[];
  rootDir?: string;
  today?: string;
  workspacePatterns?: readonly string[];
};

type RootPackageManifest = {
  workspaces?: unknown;
};

type WorkspacePackageManifest = {
  name?: unknown;
  scripts?: Record<string, unknown>;
};

const WORKSPACE_CLASSES: NightlyTestWorkspaceClass[] = [
  'api',
  'app',
  'client',
  'extension',
  'package',
  'server-service',
];

export const NIGHTLY_TEST_EXCLUSIONS: NightlyTestExclusion[] = [];

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readWorkspacePatterns(rootDir: string): string[] {
  const manifest = readJsonFile<RootPackageManifest>(
    path.join(rootDir, 'package.json'),
  );
  const workspacePatterns = manifest.workspaces;

  if (!Array.isArray(workspacePatterns)) {
    throw new Error(
      'Root package.json workspaces must be an array of strings.',
    );
  }

  const normalizedPatterns: string[] = [];
  for (const workspacePattern of workspacePatterns) {
    if (typeof workspacePattern !== 'string') {
      throw new Error(
        'Root package.json workspaces must be an array of strings.',
      );
    }

    normalizedPatterns.push(workspacePattern);
  }

  return normalizedPatterns;
}

function classifyWorkspace(
  workspacePath: string,
): NightlyTestWorkspaceClass | null {
  if (workspacePath === 'apps/server/api') {
    return 'api';
  }

  if (workspacePath === 'apps/app') {
    return 'app';
  }

  if (workspacePath.startsWith('apps/extensions/')) {
    return 'extension';
  }

  if (workspacePath.startsWith('apps/server/')) {
    return 'server-service';
  }

  if (
    workspacePath.startsWith('packages/') ||
    workspacePath.startsWith('ee/packages/')
  ) {
    return 'package';
  }

  if (workspacePath.startsWith('apps/')) {
    return 'client';
  }

  return null;
}

function discoverWorkspaceMatches(
  rootDir: string,
  workspacePatterns: readonly string[],
): Map<string, string[]> {
  const matches = new Map<string, string[]>();

  for (const workspacePattern of workspacePatterns) {
    const manifestPattern = `${workspacePattern.replace(/\/$/, '')}/package.json`;
    const manifestPaths = globSync(manifestPattern, {
      absolute: false,
      cwd: rootDir,
      nodir: true,
    }).sort();

    for (const manifestPath of manifestPaths) {
      const workspacePath = normalizePath(path.dirname(manifestPath));
      const matchingPatterns = matches.get(workspacePath) ?? [];
      matchingPatterns.push(workspacePattern);
      matches.set(workspacePath, matchingPatterns);
    }
  }

  return matches;
}

function isSuppressedTestCommand(command: string): boolean {
  return (
    command.trim().length === 0 ||
    /\|\|\s*(?:exit\s+0|true)\b/.test(command) ||
    /(?:^|[;&]\s*)(?:exit\s+0|true)\s*$/.test(command)
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsedDate.valueOf()) &&
    parsedDate.toISOString().startsWith(value)
  );
}

function validateExclusion(
  exclusion: NightlyTestExclusion,
  today: string,
): NightlyTestInventoryViolation[] {
  const violations: NightlyTestInventoryViolation[] = [];
  const isReviewDate = isIsoDate(exclusion.reviewDate);

  if (
    exclusion.owner.trim().length === 0 ||
    exclusion.reason.trim().length < 10 ||
    !Number.isInteger(exclusion.trackingIssue) ||
    exclusion.trackingIssue <= 0 ||
    !isReviewDate
  ) {
    violations.push({
      kind: 'invalid-exclusion',
      message:
        'Exclusions require a reason, owner, positive tracking issue, and ISO review date.',
      path: exclusion.path,
    });
  }

  if (isReviewDate && exclusion.reviewDate < today) {
    violations.push({
      kind: 'expired-exclusion',
      message: `Exclusion review date ${exclusion.reviewDate} has passed.`,
      path: exclusion.path,
    });
  }

  return violations;
}

function createClassCounts(
  workspaces: readonly NightlyTestWorkspace[],
): Record<NightlyTestWorkspaceClass, number> {
  const counts = Object.fromEntries(
    WORKSPACE_CLASSES.map((workspaceClass) => [workspaceClass, 0]),
  ) as Record<NightlyTestWorkspaceClass, number>;

  for (const workspace of workspaces) {
    counts[workspace.workspaceClass] += 1;
  }

  return counts;
}

function sortViolations(
  violations: NightlyTestInventoryViolation[],
): NightlyTestInventoryViolation[] {
  return violations.sort((left, right) => {
    return (
      left.path.localeCompare(right.path) ||
      left.kind.localeCompare(right.kind) ||
      left.message.localeCompare(right.message)
    );
  });
}

export function buildNightlyTestWorkspaceInventory(
  options: NightlyTestInventoryOptions = {},
): NightlyTestInventoryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const exclusions = options.exclusions ?? NIGHTLY_TEST_EXCLUSIONS;
  const workspacePatterns =
    options.workspacePatterns ?? readWorkspacePatterns(rootDir);
  const workspaceMatches = discoverWorkspaceMatches(rootDir, workspacePatterns);
  const violations: NightlyTestInventoryViolation[] = [];
  const exclusionsByPath = new Map<string, NightlyTestExclusion>();
  const testCapablePaths = new Set<string>();
  const workspaceNames = new Map<string, string>();
  const excluded: NightlyTestExclusion[] = [];
  const workspaces: NightlyTestWorkspace[] = [];

  for (const exclusion of exclusions) {
    const exclusionPath = normalizePath(exclusion.path);
    const existingExclusion = exclusionsByPath.get(exclusionPath);

    if (existingExclusion) {
      violations.push({
        kind: 'duplicate-exclusion',
        message: 'Workspace has more than one nightly test exclusion.',
        path: exclusionPath,
      });
      continue;
    }

    const normalizedExclusion = {
      ...exclusion,
      path: exclusionPath,
    };
    exclusionsByPath.set(exclusionPath, normalizedExclusion);
    violations.push(...validateExclusion(normalizedExclusion, today));
  }

  for (const [workspacePath, matchingPatterns] of [...workspaceMatches].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (matchingPatterns.length > 1) {
      violations.push({
        kind: 'duplicate-workspace',
        message: `Workspace is matched by multiple root patterns: ${matchingPatterns.join(', ')}.`,
        path: workspacePath,
      });
    }

    const manifest = readJsonFile<WorkspacePackageManifest>(
      path.join(rootDir, workspacePath, 'package.json'),
    );
    const testCommand = manifest.scripts?.test;

    if (testCommand === undefined) {
      continue;
    }

    testCapablePaths.add(workspacePath);

    if (
      typeof manifest.name !== 'string' ||
      manifest.name.trim().length === 0
    ) {
      violations.push({
        kind: 'invalid-workspace-manifest',
        message:
          'Test-capable workspace must declare a non-empty package name.',
        path: workspacePath,
      });
      continue;
    }

    if (
      typeof testCommand !== 'string' ||
      isSuppressedTestCommand(testCommand)
    ) {
      violations.push({
        kind: 'invalid-command',
        message:
          'Test-capable workspace must declare a non-empty test command that does not suppress failures.',
        path: workspacePath,
      });
      continue;
    }

    const duplicateNamePath = workspaceNames.get(manifest.name);
    if (duplicateNamePath) {
      violations.push({
        kind: 'duplicate-workspace-name',
        message: `Package name ${manifest.name} is already used by ${duplicateNamePath}.`,
        path: workspacePath,
      });
    } else {
      workspaceNames.set(manifest.name, workspacePath);
    }

    const exclusion = exclusionsByPath.get(workspacePath);
    if (exclusion) {
      excluded.push(exclusion);
      continue;
    }

    const workspaceClass = classifyWorkspace(workspacePath);
    if (!workspaceClass) {
      violations.push({
        kind: 'missing-workspace-classification',
        message:
          'Test-capable workspace is missing a nightly inventory classification.',
        path: workspacePath,
      });
      continue;
    }

    workspaces.push({
      command: `bun run --cwd ${workspacePath} test`,
      manifestCommand: testCommand,
      name: manifest.name,
      path: workspacePath,
      workspaceClass,
    });
  }

  for (const exclusionPath of exclusionsByPath.keys()) {
    if (!testCapablePaths.has(exclusionPath)) {
      violations.push({
        kind: 'stale-exclusion',
        message:
          'Exclusion does not match a discovered workspace with a test script.',
        path: exclusionPath,
      });
    }
  }

  excluded.sort((left, right) => left.path.localeCompare(right.path));
  workspaces.sort((left, right) => left.path.localeCompare(right.path));

  return {
    excluded,
    summary: {
      byClass: createClassCounts(workspaces),
      discoveredWorkspaces: workspaceMatches.size,
      excludedWorkspaces: excluded.length,
      executableWorkspaces: workspaces.length,
      testCapableWorkspaces: testCapablePaths.size,
    },
    violations: sortViolations(violations),
    workspaces,
  };
}

export function formatNightlyTestWorkspaceInventory(
  result: NightlyTestInventoryResult,
): string {
  const lines = [
    'Nightly test workspace inventory',
    `- Discovered workspaces: ${result.summary.discoveredWorkspaces}`,
    `- Test-capable workspaces: ${result.summary.testCapableWorkspaces}`,
    `- Executable workspaces: ${result.summary.executableWorkspaces}`,
    `- Excluded workspaces: ${result.summary.excludedWorkspaces}`,
    ...WORKSPACE_CLASSES.map(
      (workspaceClass) =>
        `- ${workspaceClass}: ${result.summary.byClass[workspaceClass]}`,
    ),
  ];

  if (result.violations.length === 0) {
    lines.push('Nightly test workspace inventory passed.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('Nightly test workspace inventory violations:');
  for (const violation of result.violations) {
    lines.push(`- ${violation.path} [${violation.kind}]: ${violation.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function runCli(): void {
  const result = buildNightlyTestWorkspaceInventory();

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatNightlyTestWorkspaceInventory(result));
  }

  if (result.violations.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
