import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  buildNightlyTestWorkspaceInventory,
  type NightlyTestInventoryResult,
  type NightlyTestWorkspaceClass,
} from './nightly-test-workspace-inventory';

const WORKSPACE_CLASSES: NightlyTestWorkspaceClass[] = [
  'api',
  'app',
  'client',
  'extension',
  'package',
  'server-service',
];

const SHARDED_WORKSPACE_CLASSES = new Set<NightlyTestWorkspaceClass>([
  'api',
  'app',
]);

export type NightlyUnitMatrixEntry = {
  command: string;
  executionId: string;
  name: string;
  path: string;
  shard: number;
  shardCount: number;
  workspaceClass: NightlyTestWorkspaceClass;
};

export type NightlyUnitMatrixPlan = {
  entries: NightlyUnitMatrixEntry[];
  excluded: NightlyTestInventoryResult['excluded'];
  inventorySummary: NightlyTestInventoryResult['summary'];
  sha: string;
};

export type NightlyUnitMatrixJob = {
  conclusion: string | null;
  html_url?: string;
  name: string;
};

export type NightlyUnitWorkspaceOutcome =
  | 'blocked'
  | 'failed'
  | 'passed'
  | 'skipped';

export type NightlyUnitWorkspaceResult = {
  jobUrls: string[];
  outcome: NightlyUnitWorkspaceOutcome;
  path: string;
  workspaceClass: NightlyTestWorkspaceClass;
};

type NightlyUnitClassCounts = {
  blocked: number;
  discovered: number;
  excluded: number;
  executable: number;
  executed: number;
  failed: number;
  passed: number;
  skipped: number;
};

export type NightlyUnitMatrixSummary = {
  byClass: Record<NightlyTestWorkspaceClass, NightlyUnitClassCounts>;
  inventory: NightlyUnitMatrixPlan['inventorySummary'];
  passed: boolean;
  sha: string;
  violations: string[];
  workspaces: NightlyUnitWorkspaceResult[];
};

function createExecutionId(
  workspaceClass: NightlyTestWorkspaceClass,
  workspacePath: string,
  shard: number,
  shardCount: number,
): string {
  const normalizedPath = workspacePath
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
  const shardSuffix =
    shardCount > 1 ? `--${shard}-of-${shardCount}` : '';

  return `${workspaceClass}--${normalizedPath}${shardSuffix}`;
}

function validateSha(sha: string): void {
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Nightly unit matrix SHA must be a full 40-character SHA.');
  }
}

export function buildNightlyUnitMatrixPlan(
  inventory: NightlyTestInventoryResult,
  sha: string,
  shardCount = 4,
): NightlyUnitMatrixPlan {
  validateSha(sha);

  if (inventory.violations.length > 0) {
    throw new Error(
      `Nightly workspace inventory has ${inventory.violations.length} violation(s).`,
    );
  }

  if (inventory.summary.executableWorkspaces === 0) {
    throw new Error(
      'Nightly workspace inventory must contain at least one executable workspace.',
    );
  }

  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error('Nightly unit matrix shard count must be a positive integer.');
  }

  const entries: NightlyUnitMatrixEntry[] = [];
  const executionIds = new Set<string>();

  for (const workspace of inventory.workspaces) {
    const workspaceShardCount = SHARDED_WORKSPACE_CLASSES.has(
      workspace.workspaceClass,
    )
      ? shardCount
      : 1;

    for (let shard = 1; shard <= workspaceShardCount; shard += 1) {
      const executionId = createExecutionId(
        workspace.workspaceClass,
        workspace.path,
        shard,
        workspaceShardCount,
      );

      if (executionIds.has(executionId)) {
        throw new Error(`Duplicate nightly execution ID: ${executionId}`);
      }

      executionIds.add(executionId);
      entries.push({
        command: workspace.command,
        executionId,
        name: workspace.name,
        path: workspace.path,
        shard,
        shardCount: workspaceShardCount,
        workspaceClass: workspace.workspaceClass,
      });
    }
  }

  return {
    entries,
    excluded: inventory.excluded,
    inventorySummary: inventory.summary,
    sha,
  };
}

function createClassCounts(
  plan: NightlyUnitMatrixPlan,
): Record<NightlyTestWorkspaceClass, NightlyUnitClassCounts> {
  return Object.fromEntries(
    WORKSPACE_CLASSES.map((workspaceClass) => [
      workspaceClass,
      {
        blocked: 0,
        discovered: plan.inventorySummary.discoveredByClass[workspaceClass],
        excluded: plan.inventorySummary.excludedByClass[workspaceClass],
        executable: plan.inventorySummary.byClass[workspaceClass],
        executed: 0,
        failed: 0,
        passed: 0,
        skipped: 0,
      },
    ]),
  ) as Record<NightlyTestWorkspaceClass, NightlyUnitClassCounts>;
}

function classifyConclusion(
  conclusion: string | null,
): NightlyUnitWorkspaceOutcome {
  if (conclusion === 'success') {
    return 'passed';
  }

  if (
    conclusion === 'failure' ||
    conclusion === 'timed_out' ||
    conclusion === 'action_required' ||
    conclusion === 'startup_failure'
  ) {
    return 'failed';
  }

  if (conclusion === 'skipped') {
    return 'skipped';
  }

  return 'blocked';
}

function resolveWorkspaceOutcome(
  outcomes: NightlyUnitWorkspaceOutcome[],
): NightlyUnitWorkspaceOutcome {
  if (outcomes.includes('failed')) {
    return 'failed';
  }

  if (outcomes.includes('blocked')) {
    return 'blocked';
  }

  if (outcomes.includes('skipped')) {
    return 'skipped';
  }

  return 'passed';
}

export function aggregateNightlyUnitMatrix(
  plan: NightlyUnitMatrixPlan,
  jobs: readonly NightlyUnitMatrixJob[],
): NightlyUnitMatrixSummary {
  const expectedEntriesByWorkspace = new Map<
    string,
    NightlyUnitMatrixEntry[]
  >();
  const jobsByName = new Map<string, NightlyUnitMatrixJob[]>();
  const violations: string[] = [];

  for (const entry of plan.entries) {
    const entries = expectedEntriesByWorkspace.get(entry.path) ?? [];
    entries.push(entry);
    expectedEntriesByWorkspace.set(entry.path, entries);
  }

  for (const job of jobs) {
    const matchingJobs = jobsByName.get(job.name) ?? [];
    matchingJobs.push(job);
    jobsByName.set(job.name, matchingJobs);
  }

  const workspaces: NightlyUnitWorkspaceResult[] = [];
  const byClass = createClassCounts(plan);

  for (const [workspacePath, entries] of [
    ...expectedEntriesByWorkspace.entries(),
  ].sort(([left], [right]) => left.localeCompare(right))) {
    const outcomes: NightlyUnitWorkspaceOutcome[] = [];
    const jobUrls: string[] = [];

    for (const entry of entries) {
      const expectedJobName = `Unit / ${entry.executionId}`;
      const matchingJobs = jobsByName.get(expectedJobName) ?? [];

      if (matchingJobs.length === 0) {
        violations.push(`Missing job evidence for ${expectedJobName}.`);
        outcomes.push('blocked');
        continue;
      }

      if (matchingJobs.length > 1) {
        violations.push(`Duplicate job evidence for ${expectedJobName}.`);
        outcomes.push('blocked');
        continue;
      }

      const [job] = matchingJobs;
      outcomes.push(classifyConclusion(job.conclusion));
      if (job.html_url) {
        jobUrls.push(job.html_url);
      }
    }

    const workspaceClass = entries[0].workspaceClass;
    const outcome = resolveWorkspaceOutcome(outcomes);
    const classCounts = byClass[workspaceClass];

    classCounts[outcome] += 1;
    if (outcome === 'passed' || outcome === 'failed') {
      classCounts.executed += 1;
    }

    workspaces.push({
      jobUrls,
      outcome,
      path: workspacePath,
      workspaceClass,
    });
  }

  return {
    byClass,
    inventory: plan.inventorySummary,
    passed:
      violations.length === 0 &&
      workspaces.every((workspace) => workspace.outcome === 'passed'),
    sha: plan.sha,
    violations,
    workspaces,
  };
}

export function formatNightlyUnitMatrixSummary(
  summary: NightlyUnitMatrixSummary,
): string {
  const lines = [
    '# Nightly Unit Matrix',
    '',
    `- SHA: \`${summary.sha}\``,
    `- Discovered workspaces: ${summary.inventory.discoveredWorkspaces}`,
    `- Test-capable workspaces: ${summary.inventory.testCapableWorkspaces}`,
    `- Executable workspaces: ${summary.inventory.executableWorkspaces}`,
    `- Excluded workspaces: ${summary.inventory.excludedWorkspaces}`,
    `- Contract: ${summary.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Class | Discovered | Executable | Executed | Passed | Failed | Skipped | Blocked | Excluded |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...WORKSPACE_CLASSES.map((workspaceClass) => {
      const counts = summary.byClass[workspaceClass];
      return `| ${workspaceClass} | ${counts.discovered} | ${counts.executable} | ${counts.executed} | ${counts.passed} | ${counts.failed} | ${counts.skipped} | ${counts.blocked} | ${counts.excluded} |`;
    }),
  ];

  if (summary.violations.length > 0) {
    lines.push('', '## Contract violations', '');
    for (const violation of summary.violations) {
      lines.push(`- ${violation}`);
    }
  }

  const nonPassingWorkspaces = summary.workspaces.filter(
    (workspace) => workspace.outcome !== 'passed',
  );
  if (nonPassingWorkspaces.length > 0) {
    lines.push('', '## Non-passing workspaces', '');
    for (const workspace of nonPassingWorkspaces) {
      const jobLinks =
        workspace.jobUrls.length > 0
          ? workspace.jobUrls
              .map((jobUrl, index) => `[job ${index + 1}](${jobUrl})`)
              .join(', ')
          : 'no terminal job evidence';
      lines.push(
        `- \`${workspace.path}\`: ${workspace.outcome} (${jobLinks})`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function readArgument(name: string): string {
  const argumentIndex = process.argv.indexOf(name);
  const value = process.argv[argumentIndex + 1];

  if (argumentIndex === -1 || !value || value.startsWith('--')) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(): void {
  const command = process.argv[2];

  if (command === 'plan') {
    const outputPath = readArgument('--output');
    const sha = readArgument('--sha');
    const plan = buildNightlyUnitMatrixPlan(
      buildNightlyTestWorkspaceInventory(),
      sha,
    );
    writeJson(outputPath, plan);
    process.stdout.write(
      `Planned ${plan.entries.length} nightly executions for ${plan.inventorySummary.executableWorkspaces} workspaces at ${plan.sha}.\n`,
    );
    return;
  }

  if (command === 'aggregate') {
    const jobs = JSON.parse(
      readFileSync(readArgument('--jobs'), 'utf8'),
    ) as NightlyUnitMatrixJob[];
    const plan = JSON.parse(
      readFileSync(readArgument('--plan'), 'utf8'),
    ) as NightlyUnitMatrixPlan;
    const outputPath = readArgument('--output');
    const markdownPath = readArgument('--markdown');
    const summary = aggregateNightlyUnitMatrix(plan, jobs);

    writeJson(outputPath, summary);
    writeFileSync(
      markdownPath,
      formatNightlyUnitMatrixSummary(summary),
      'utf8',
    );
    process.stdout.write(formatNightlyUnitMatrixSummary(summary));

    if (!summary.passed) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(
    'Usage: nightly-unit-matrix.ts plan|aggregate [required arguments]',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
