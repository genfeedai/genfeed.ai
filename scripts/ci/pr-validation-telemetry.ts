import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_VERSION = '1.0';
const GITHUB_API_VERSION = '2026-03-10';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGES = 100;
const MAX_SEARCH_RESULTS = 1_000;
const MAX_SEARCH_WINDOW_DAYS = 36_500;

export type PullRequestSurface =
  | 'api'
  | 'app'
  | 'desktop'
  | 'documentation'
  | 'mixed'
  | 'package'
  | 'repository';

export type ValidationDisposition = 'failed' | 'incomplete' | 'ready';

export type PullRequestIdentity = {
  baseBranch: string;
  baseSha: string;
  createdAt: string;
  headSha: string;
  mergedAt: string;
  number: number;
  repository: string;
  title: string;
  url: string;
};

export type WorkflowRunEvidence = {
  completedAt: string | null;
  conclusion: string | null;
  createdAt: string;
  executionDurationMs: number | null;
  headSha: string;
  id: number;
  name: string;
  queueDelayMs: number | null;
  startedAt: string | null;
  status: string;
  url: string;
};

export type CheckRunEvidence = {
  completedAt: string | null;
  conclusion: string | null;
  durationMs: number | null;
  headSha: string;
  id: number;
  name: string;
  startedAt: string | null;
  status: string;
  url: string;
};

export type PullRequestValidationObservation = {
  checks: CheckRunEvidence[];
  disposition: ValidationDisposition;
  filesChanged: number;
  identity: PullRequestIdentity;
  incompleteReasons: string[];
  slowestChecks: Array<{
    durationMs: number;
    name: string;
    url: string;
  }>;
  surface: PullRequestSurface;
  timing: {
    criticalPathMs: number | null;
    executionDurationMs: number | null;
    queueDelayMs: number | null;
  };
  workflowRuns: WorkflowRunEvidence[];
};

export type PullRequestValidationReport = {
  collectedAt: string;
  collectionErrors: string[];
  observations: PullRequestValidationObservation[];
  repository: string;
  selection: {
    limit: number | null;
    mode: 'explicit' | 'recent-merged';
    pullRequests: number[];
  };
  summary: {
    byDisposition: Record<ValidationDisposition, number>;
    bySurface: Record<PullRequestSurface, number>;
    pullRequests: number;
  };
  version: typeof REPORT_VERSION;
};

export type GitHubPullRequest = {
  base: { ref: string; sha: string };
  changed_files: number;
  created_at: string;
  head: { sha: string };
  html_url: string;
  merged_at: string | null;
  number: number;
  title: string;
};

export type GitHubWorkflowRun = {
  conclusion: string | null;
  created_at: string;
  head_sha: string;
  html_url: string;
  id: number;
  name: string;
  run_started_at: string | null;
  status: string;
  updated_at: string;
};

export type GitHubCheckRun = {
  completed_at: string | null;
  conclusion: string | null;
  head_sha: string;
  html_url: string;
  id: number;
  name: string;
  started_at: string | null;
  status: string;
};

type GitHubPullRequestFile = {
  filename: string;
};

export type GitHubPullRequestSearchItem = {
  number: number;
  pull_request: { merged_at: string };
};

export type GitHubPage = {
  data: unknown;
  link: string | null;
};

export type PaginatedResult<T> = {
  complete: boolean;
  error: string | null;
  items: T[];
  pages: number;
};

export type GitHubClient = {
  loadPage: (url: string) => Promise<GitHubPage>;
};

type CliOptions = {
  jsonOut: string;
  limit: number;
  markdownOut: string;
  pullRequests: number[];
  repository: string;
};

type ObservationInput = {
  checkRuns: readonly GitHubCheckRun[];
  collectionErrors?: readonly string[];
  files: readonly string[];
  pullRequest: GitHubPullRequest;
  repository: string;
  workflowRuns: readonly GitHubWorkflowRun[];
};

const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'stale',
  'startup_failure',
  'timed_out',
]);
const READY_CONCLUSIONS = new Set(['neutral', 'skipped', 'success']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimestamp(value: string | null): number | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isGitSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40,64}$/i.test(value);
}

function durationBetween(
  start: string | null,
  end: string | null,
): number | null {
  const startTimestamp = parseTimestamp(start);
  const endTimestamp = parseTimestamp(end);

  if (startTimestamp === null || endTimestamp === null) {
    return null;
  }

  return endTimestamp >= startTimestamp ? endTimestamp - startTimestamp : null;
}

function maximum(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

function classifyFile(file: string): Exclude<PullRequestSurface, 'mixed'> {
  const normalized = file.replaceAll('\\', '/');

  if (normalized.startsWith('apps/desktop/')) {
    return 'desktop';
  }

  if (normalized.startsWith('apps/server/')) {
    return 'api';
  }

  if (normalized.startsWith('apps/app/')) {
    return 'app';
  }

  if (
    normalized.startsWith('apps/docs/') ||
    normalized.startsWith('docs/') ||
    normalized.endsWith('.md')
  ) {
    return 'documentation';
  }

  if (
    normalized.startsWith('packages/') ||
    normalized.startsWith('ee/packages/')
  ) {
    return 'package';
  }

  return 'repository';
}

export function classifyPullRequestSurface(
  files: readonly string[],
): PullRequestSurface {
  const surfaces = new Set(files.map(classifyFile));

  if (surfaces.size !== 1) {
    return 'mixed';
  }

  return [...surfaces][0] ?? 'repository';
}

export function parseNextLink(link: string | null): string | null {
  if (link === null) {
    return null;
  }

  for (const part of link.split(',')) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match?.[2] === 'next') {
      return match[1] ?? null;
    }
  }

  return null;
}

export async function collectPaginated<T>(
  initialUrl: string,
  loadPage: (url: string) => Promise<GitHubPage>,
  extractItems: (data: unknown) => T[],
  extractTotalCount?: (data: unknown) => number,
): Promise<PaginatedResult<T>> {
  const items: T[] = [];
  const visited = new Set<string>();
  let nextUrl: string | null = initialUrl;
  let expectedTotal: number | null = null;
  let pages = 0;

  try {
    while (nextUrl !== null) {
      if (visited.has(nextUrl)) {
        throw new Error(`Pagination loop detected at ${nextUrl}`);
      }
      if (pages >= MAX_PAGES) {
        throw new Error(`Pagination exceeded ${MAX_PAGES} pages`);
      }

      visited.add(nextUrl);
      const page = await loadPage(nextUrl);
      if (extractTotalCount !== undefined) {
        const pageTotal = extractTotalCount(page.data);
        if (expectedTotal !== null && expectedTotal !== pageTotal) {
          throw new Error(
            `Pagination total changed from ${expectedTotal} to ${pageTotal}`,
          );
        }
        expectedTotal = pageTotal;
      }
      items.push(...extractItems(page.data));
      pages += 1;
      nextUrl = parseNextLink(page.link);
    }

    if (expectedTotal !== null && items.length !== expectedTotal) {
      throw new Error(
        `Pagination returned ${items.length} of ${expectedTotal} items`,
      );
    }

    return { complete: true, error: null, items, pages };
  } catch (error) {
    return {
      complete: false,
      error: error instanceof Error ? error.message : String(error),
      items,
      pages,
    };
  }
}

function requireArray(data: unknown, label: string): unknown[] {
  if (!Array.isArray(data)) {
    throw new Error(`${label} response must be an array`);
  }

  return data;
}

function requireArrayProperty(
  data: unknown,
  property: string,
  label: string,
): unknown[] {
  if (!isRecord(data) || !Array.isArray(data[property])) {
    throw new Error(`${label} response must contain ${property}[]`);
  }

  return data[property];
}

function requireTotalCount(data: unknown, label: string): number {
  if (
    !isRecord(data) ||
    typeof data.total_count !== 'number' ||
    !Number.isInteger(data.total_count) ||
    data.total_count < 0
  ) {
    throw new Error(
      `${label} response must contain a non-negative total_count`,
    );
  }

  return data.total_count;
}

function requireSearchTotalCount(data: unknown): number {
  if (!isRecord(data) || data.incomplete_results !== false) {
    throw new Error('Merged pull-request search returned incomplete results');
  }

  return requireTotalCount(data, 'Merged pull-request search');
}

function isGitHubPullRequest(value: unknown): value is GitHubPullRequest {
  return (
    isRecord(value) &&
    typeof value.number === 'number' &&
    typeof value.title === 'string' &&
    typeof value.html_url === 'string' &&
    typeof value.created_at === 'string' &&
    parseTimestamp(value.created_at) !== null &&
    ((typeof value.merged_at === 'string' &&
      parseTimestamp(value.merged_at) !== null) ||
      value.merged_at === null) &&
    typeof value.changed_files === 'number' &&
    Number.isInteger(value.changed_files) &&
    value.changed_files >= 0 &&
    isRecord(value.base) &&
    typeof value.base.ref === 'string' &&
    value.base.ref.trim().length > 0 &&
    isGitSha(value.base.sha) &&
    isRecord(value.head) &&
    isGitSha(value.head.sha)
  );
}

function isGitHubPullRequestSearchItem(
  value: unknown,
): value is GitHubPullRequestSearchItem {
  return (
    isRecord(value) &&
    typeof value.number === 'number' &&
    isRecord(value.pull_request) &&
    typeof value.pull_request.merged_at === 'string' &&
    parseTimestamp(value.pull_request.merged_at) !== null
  );
}

function isGitHubPullRequestFile(
  value: unknown,
): value is GitHubPullRequestFile {
  return isRecord(value) && typeof value.filename === 'string';
}

function isGitHubWorkflowRun(value: unknown): value is GitHubWorkflowRun {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.head_sha === 'string' &&
    typeof value.status === 'string' &&
    (typeof value.conclusion === 'string' || value.conclusion === null) &&
    typeof value.created_at === 'string' &&
    (typeof value.run_started_at === 'string' ||
      value.run_started_at === null) &&
    typeof value.updated_at === 'string' &&
    typeof value.html_url === 'string'
  );
}

function isGitHubCheckRun(value: unknown): value is GitHubCheckRun {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.head_sha === 'string' &&
    typeof value.status === 'string' &&
    (typeof value.conclusion === 'string' || value.conclusion === null) &&
    (typeof value.started_at === 'string' || value.started_at === null) &&
    (typeof value.completed_at === 'string' || value.completed_at === null) &&
    typeof value.html_url === 'string'
  );
}

function parseTypedArray<T>(
  values: unknown[],
  guard: (value: unknown) => value is T,
  label: string,
): T[] {
  const parsed: T[] = [];

  for (const value of values) {
    if (!guard(value)) {
      throw new Error(`${label} response contains an invalid item`);
    }
    parsed.push(value);
  }

  return parsed;
}

function workflowEvidence(run: GitHubWorkflowRun): WorkflowRunEvidence {
  return {
    completedAt: run.status === 'completed' ? run.updated_at : null,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    executionDurationMs: durationBetween(
      run.run_started_at,
      run.status === 'completed' ? run.updated_at : null,
    ),
    headSha: run.head_sha,
    id: run.id,
    name: run.name,
    queueDelayMs: durationBetween(run.created_at, run.run_started_at),
    startedAt: run.run_started_at,
    status: run.status,
    url: run.html_url,
  };
}

function checkEvidence(run: GitHubCheckRun): CheckRunEvidence {
  return {
    completedAt: run.completed_at,
    conclusion: run.conclusion,
    durationMs: durationBetween(run.started_at, run.completed_at),
    headSha: run.head_sha,
    id: run.id,
    name: run.name,
    startedAt: run.started_at,
    status: run.status,
    url: run.html_url,
  };
}

function addEvidenceCompletenessReasons(
  workflows: readonly WorkflowRunEvidence[],
  checks: readonly CheckRunEvidence[],
  reasons: string[],
): void {
  if (workflows.length === 0) {
    reasons.push('No exact-head pull-request workflow runs were returned.');
  }
  if (checks.length === 0) {
    reasons.push('No exact-head check runs were returned.');
  }

  for (const workflow of workflows) {
    if (
      parseTimestamp(workflow.createdAt) === null ||
      workflow.startedAt === null ||
      workflow.completedAt === null ||
      workflow.queueDelayMs === null ||
      workflow.executionDurationMs === null
    ) {
      reasons.push(`Workflow run ${workflow.id} has incomplete timing.`);
    }
    if (workflow.status !== 'completed' || workflow.conclusion === null) {
      reasons.push(`Workflow run ${workflow.id} is not terminal.`);
    } else if (
      !FAILURE_CONCLUSIONS.has(workflow.conclusion) &&
      !READY_CONCLUSIONS.has(workflow.conclusion)
    ) {
      reasons.push(
        `Workflow run ${workflow.id} has unknown conclusion ${workflow.conclusion}.`,
      );
    }
  }

  for (const check of checks) {
    if (
      check.startedAt === null ||
      check.completedAt === null ||
      check.durationMs === null
    ) {
      reasons.push(`Check run ${check.id} has incomplete timing.`);
    }
    if (check.status !== 'completed' || check.conclusion === null) {
      reasons.push(`Check run ${check.id} is not terminal.`);
    } else if (
      !FAILURE_CONCLUSIONS.has(check.conclusion) &&
      !READY_CONCLUSIONS.has(check.conclusion)
    ) {
      reasons.push(
        `Check run ${check.id} has unknown conclusion ${check.conclusion}.`,
      );
    }
  }
}

function hasFailureConclusion(
  workflows: readonly WorkflowRunEvidence[],
  checks: readonly CheckRunEvidence[],
): boolean {
  return [...workflows, ...checks].some(
    (item) =>
      item.conclusion !== null && FAILURE_CONCLUSIONS.has(item.conclusion),
  );
}

export function buildPullRequestObservation(
  input: ObservationInput,
): PullRequestValidationObservation {
  if (input.pullRequest.merged_at === null) {
    throw new Error(`Pull request #${input.pullRequest.number} is not merged`);
  }

  const reasons = [...(input.collectionErrors ?? [])];
  const mismatchedWorkflows = input.workflowRuns.filter(
    (run) => run.head_sha !== input.pullRequest.head.sha,
  );
  const mismatchedChecks = input.checkRuns.filter(
    (run) => run.head_sha !== input.pullRequest.head.sha,
  );
  const workflows = input.workflowRuns
    .filter((run) => run.head_sha === input.pullRequest.head.sha)
    .map(workflowEvidence)
    .sort((left, right) => left.id - right.id);
  const checks = input.checkRuns
    .filter((run) => run.head_sha === input.pullRequest.head.sha)
    .map(checkEvidence)
    .sort((left, right) => left.id - right.id);

  if (input.files.length === 0) {
    reasons.push('No changed files were returned.');
  }
  if (input.files.length !== input.pullRequest.changed_files) {
    reasons.push(
      `Changed-file collection returned ${input.files.length} of ${input.pullRequest.changed_files} files.`,
    );
  }
  if (mismatchedWorkflows.length > 0) {
    reasons.push(
      `${mismatchedWorkflows.length} workflow run(s) targeted another head SHA.`,
    );
  }
  if (mismatchedChecks.length > 0) {
    reasons.push(
      `${mismatchedChecks.length} check run(s) targeted another head SHA.`,
    );
  }

  addEvidenceCompletenessReasons(workflows, checks, reasons);

  const criticalPathStarts = [
    ...workflows.map((run) => parseTimestamp(run.createdAt)),
    ...checks.map((run) => parseTimestamp(run.startedAt)),
  ].filter((value): value is number => value !== null);
  const criticalPathEnds = [
    ...workflows.map((run) => parseTimestamp(run.completedAt)),
    ...checks.map((run) => parseTimestamp(run.completedAt)),
  ].filter((value): value is number => value !== null);
  const criticalPathMs =
    criticalPathStarts.length > 0 && criticalPathEnds.length > 0
      ? Math.max(...criticalPathEnds) - Math.min(...criticalPathStarts)
      : null;
  if (criticalPathMs !== null && criticalPathMs < 0) {
    reasons.push('Validation critical-path timestamps are out of order.');
  }

  const incompleteReasons = [...new Set(reasons)].sort();
  const disposition: ValidationDisposition =
    incompleteReasons.length > 0
      ? 'incomplete'
      : hasFailureConclusion(workflows, checks)
        ? 'failed'
        : 'ready';

  return {
    checks,
    disposition,
    filesChanged: input.files.length,
    identity: {
      baseBranch: input.pullRequest.base.ref,
      baseSha: input.pullRequest.base.sha,
      createdAt: input.pullRequest.created_at,
      headSha: input.pullRequest.head.sha,
      mergedAt: input.pullRequest.merged_at,
      number: input.pullRequest.number,
      repository: input.repository,
      title: input.pullRequest.title,
      url: input.pullRequest.html_url,
    },
    incompleteReasons,
    slowestChecks: checks
      .filter(
        (check): check is CheckRunEvidence & { durationMs: number } =>
          check.durationMs !== null,
      )
      .sort(
        (left, right) =>
          right.durationMs - left.durationMs ||
          left.name.localeCompare(right.name),
      )
      .slice(0, 5)
      .map((check) => ({
        durationMs: check.durationMs,
        name: check.name,
        url: check.url,
      })),
    surface: classifyPullRequestSurface(input.files),
    timing: {
      criticalPathMs:
        criticalPathMs !== null && criticalPathMs >= 0 ? criticalPathMs : null,
      executionDurationMs: maximum(
        workflows.map((run) => run.executionDurationMs),
      ),
      queueDelayMs: maximum(workflows.map((run) => run.queueDelayMs)),
    },
    workflowRuns: workflows,
  };
}

function emptyDispositionCounts(): Record<ValidationDisposition, number> {
  return { failed: 0, incomplete: 0, ready: 0 };
}

function emptySurfaceCounts(): Record<PullRequestSurface, number> {
  return {
    api: 0,
    app: 0,
    desktop: 0,
    documentation: 0,
    mixed: 0,
    package: 0,
    repository: 0,
  };
}

export function buildPullRequestValidationReport(options: {
  collectedAt?: string;
  collectionErrors?: readonly string[];
  limit: number | null;
  mode: 'explicit' | 'recent-merged';
  observations: readonly PullRequestValidationObservation[];
  pullRequests: readonly number[];
  repository: string;
}): PullRequestValidationReport {
  const byDisposition = emptyDispositionCounts();
  const bySurface = emptySurfaceCounts();
  const observations = [...options.observations].sort(
    (left, right) => left.identity.number - right.identity.number,
  );

  for (const observation of observations) {
    byDisposition[observation.disposition] += 1;
    bySurface[observation.surface] += 1;
  }

  return {
    collectedAt: options.collectedAt ?? new Date().toISOString(),
    collectionErrors: [...(options.collectionErrors ?? [])],
    observations,
    repository: options.repository,
    selection: {
      limit: options.limit,
      mode: options.mode,
      pullRequests: [...options.pullRequests].sort(
        (left, right) => left - right,
      ),
    },
    summary: {
      byDisposition,
      bySurface,
      pullRequests: observations.length,
    },
    version: REPORT_VERSION,
  };
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return 'n/a';
  }

  const seconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

function escapeTable(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function formatPullRequestValidationMarkdown(
  report: PullRequestValidationReport,
): string {
  const lines = [
    '# Pull-request Validation Telemetry',
    '',
    `- Repository: \`${report.repository}\``,
    `- Collected: ${report.collectedAt}`,
    `- Selection: ${report.selection.mode}`,
    `- Pull requests: ${report.summary.pullRequests}`,
    `- Dispositions: ${report.summary.byDisposition.ready} ready, ${report.summary.byDisposition.failed} failed, ${report.summary.byDisposition.incomplete} incomplete`,
    '',
    '| PR | Surface | Base | Head | Disposition | Queue | Execution | Critical path | Slowest check |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |',
  ];

  for (const observation of report.observations) {
    const slowest = observation.slowestChecks[0];
    lines.push(
      `| [#${observation.identity.number}](${observation.identity.url}) ${escapeTable(observation.identity.title)} | ${observation.surface} | ${escapeTable(observation.identity.baseBranch)}@\`${observation.identity.baseSha.slice(0, 12)}\` | \`${observation.identity.headSha.slice(0, 12)}\` | ${observation.disposition} | ${formatDuration(observation.timing.queueDelayMs)} | ${formatDuration(observation.timing.executionDurationMs)} | ${formatDuration(observation.timing.criticalPathMs)} | ${slowest ? `${escapeTable(slowest.name)} (${formatDuration(slowest.durationMs)})` : 'n/a'} |`,
    );

    if (observation.incompleteReasons.length > 0) {
      lines.push(
        `|  |  |  |  | Reasons |  |  |  | ${escapeTable(observation.incompleteReasons.join('; '))} |`,
      );
    }
  }

  if (report.collectionErrors.length > 0) {
    lines.push('', '## Collection errors', '');
    for (const error of report.collectionErrors) {
      lines.push(`- ${error}`);
    }
  }

  lines.push(
    '',
    '> Ready means the collected final-head evidence is complete and terminal; it does not prove branch protection, review approval, mergeability, or deployment readiness.',
    '',
  );

  return lines.join('\n');
}

function createGitHubClient(token: string): GitHubClient {
  return {
    async loadPage(url: string): Promise<GitHubPage> {
      const response = await fetch(
        url.startsWith('https://') ? url : `https://api.github.com${url}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'genfeedai-pr-validation-telemetry',
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
        },
      );

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw new Error(
          `GitHub REST ${response.status} for ${url}: ${body || response.statusText}`,
        );
      }

      return {
        data: await response.json(),
        link: response.headers.get('link'),
      };
    },
  };
}

async function getPullRequest(
  client: GitHubClient,
  repository: string,
  number: number,
): Promise<GitHubPullRequest> {
  const page = await client.loadPage(`/repos/${repository}/pulls/${number}`);
  if (!isGitHubPullRequest(page.data)) {
    throw new Error(`Pull request #${number} response is invalid`);
  }
  if (page.data.merged_at === null) {
    throw new Error(`Pull request #${number} is not merged`);
  }
  if (
    page.data.changed_files === undefined ||
    !Number.isInteger(page.data.changed_files) ||
    page.data.changed_files < 0
  ) {
    throw new Error(`Pull request #${number} is missing changed_files`);
  }

  return page.data;
}

async function getRecentMergedPullRequests(
  client: GitHubClient,
  repository: string,
  limit: number,
): Promise<GitHubPullRequest[]> {
  const searchUrl = await findMergedPullRequestSearchWindow(
    client,
    repository,
    limit,
  );
  const searchResult = await collectPaginated(
    searchUrl,
    client.loadPage,
    (data) =>
      parseTypedArray(
        requireArrayProperty(data, 'items', 'Merged pull-request search'),
        isGitHubPullRequestSearchItem,
        'Merged pull-request search',
      ),
    requireSearchTotalCount,
  );
  if (!searchResult.complete) {
    throw new Error(
      `Merged pull-request search did not complete: ${searchResult.error}`,
    );
  }
  const selectedNumbers = selectRecentMergedPullRequestNumbers(
    searchResult.items,
    limit,
  );
  const details: GitHubPullRequest[] = [];
  for (const number of selectedNumbers) {
    details.push(await getPullRequest(client, repository, number));
  }

  return details;
}

export function selectRecentMergedPullRequestNumbers(
  items: readonly GitHubPullRequestSearchItem[],
  limit: number,
): number[] {
  return [...items]
    .sort((left, right) => {
      return (
        Date.parse(right.pull_request.merged_at) -
          Date.parse(left.pull_request.merged_at) || right.number - left.number
      );
    })
    .slice(0, limit)
    .map((item) => item.number);
}

function mergedPullRequestSearchUrl(
  repository: string,
  referenceDate: Date,
  windowDays: number,
): string {
  const cutoff = new Date(referenceDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const query = [
    `repo:${repository}`,
    'is:pr',
    'is:merged',
    `merged:>=${cutoff.toISOString().slice(0, 10)}`,
  ].join(' ');
  const parameters = new URLSearchParams({
    order: 'desc',
    per_page: '100',
    q: query,
    sort: 'updated',
  });

  return `/search/issues?${parameters.toString()}`;
}

async function mergedPullRequestSearchCount(
  client: GitHubClient,
  url: string,
): Promise<number> {
  const page = await client.loadPage(url);
  return requireSearchTotalCount(page.data);
}

export async function findMergedPullRequestSearchWindow(
  client: GitHubClient,
  repository: string,
  limit: number,
  referenceDate: Date = new Date(),
): Promise<string> {
  let insufficientDays = 0;
  let windowDays = 1;

  while (windowDays <= MAX_SEARCH_WINDOW_DAYS) {
    const url = mergedPullRequestSearchUrl(
      repository,
      referenceDate,
      windowDays,
    );
    const count = await mergedPullRequestSearchCount(client, url);

    if (count < limit) {
      insufficientDays = windowDays;
      if (windowDays === MAX_SEARCH_WINDOW_DAYS) break;
      windowDays = Math.min(windowDays * 2, MAX_SEARCH_WINDOW_DAYS);
      continue;
    }

    if (count <= MAX_SEARCH_RESULTS) {
      return url;
    }

    let low = insufficientDays + 1;
    let high = windowDays - 1;
    let viableUrl: string | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const middleUrl = mergedPullRequestSearchUrl(
        repository,
        referenceDate,
        middle,
      );
      const middleCount = await mergedPullRequestSearchCount(client, middleUrl);
      if (middleCount < limit) {
        low = middle + 1;
      } else {
        if (middleCount <= MAX_SEARCH_RESULTS) {
          viableUrl = middleUrl;
        }
        high = middle - 1;
      }
    }

    if (viableUrl !== null) {
      return viableUrl;
    }

    throw new Error(
      `No merged-date window contains ${limit}-${MAX_SEARCH_RESULTS} pull requests`,
    );
  }

  throw new Error(
    `Fewer than ${limit} merged pull requests were found within ${MAX_SEARCH_WINDOW_DAYS} days`,
  );
}

async function collectObservation(
  client: GitHubClient,
  repository: string,
  pullRequest: GitHubPullRequest,
): Promise<PullRequestValidationObservation> {
  const [filesResult, workflowsResult, checksResult] = await Promise.all([
    collectPaginated(
      `/repos/${repository}/pulls/${pullRequest.number}/files?per_page=100`,
      client.loadPage,
      (data) =>
        parseTypedArray(
          requireArray(data, 'Pull-request files'),
          isGitHubPullRequestFile,
          'Pull-request files',
        ),
    ),
    collectPaginated(
      `/repos/${repository}/actions/runs?event=pull_request&head_sha=${encodeURIComponent(pullRequest.head.sha)}&per_page=100`,
      client.loadPage,
      (data) =>
        parseTypedArray(
          requireArrayProperty(data, 'workflow_runs', 'Workflow runs'),
          isGitHubWorkflowRun,
          'Workflow runs',
        ),
      (data) => requireTotalCount(data, 'Workflow runs'),
    ),
    collectPaginated(
      `/repos/${repository}/commits/${pullRequest.head.sha}/check-runs?filter=latest&per_page=100`,
      client.loadPage,
      (data) =>
        parseTypedArray(
          requireArrayProperty(data, 'check_runs', 'Check runs'),
          isGitHubCheckRun,
          'Check runs',
        ),
      (data) => requireTotalCount(data, 'Check runs'),
    ),
  ]);
  const collectionErrors = [
    filesResult.complete
      ? null
      : `Changed-file collection: ${filesResult.error}`,
    workflowsResult.complete
      ? null
      : `Workflow-run collection: ${workflowsResult.error}`,
    checksResult.complete
      ? null
      : `Check-run collection: ${checksResult.error}`,
  ].filter((reason): reason is string => reason !== null);

  return buildPullRequestObservation({
    checkRuns: checksResult.items,
    collectionErrors,
    files: filesResult.items.map((file) => file.filename),
    pullRequest,
    repository,
    workflowRuns: workflowsResult.items,
  });
}

function readArgument(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${args[index]}`);
  }
  return value;
}

function parsePullRequestNumbers(value: string): number[] {
  if (value.trim().length === 0) {
    return [];
  }

  const numbers = value.split(',').map((part) => Number(part.trim()));
  if (
    numbers.some(
      (number) => !Number.isInteger(number) || number <= 0 || number > 2 ** 31,
    )
  ) {
    throw new Error('--pull-requests must contain positive integers');
  }

  return [...new Set(numbers)].sort((left, right) => left - right);
}

export function parseCliOptions(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const options: CliOptions = {
    jsonOut: 'artifacts/pr-validation-telemetry/report.json',
    limit: DEFAULT_LIMIT,
    markdownOut: 'artifacts/pr-validation-telemetry/report.md',
    pullRequests: [],
    repository: env.GITHUB_REPOSITORY ?? '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--repository') {
      options.repository = readArgument(args, index);
      index += 1;
    } else if (argument === '--limit') {
      options.limit = Number(readArgument(args, index));
      index += 1;
    } else if (argument === '--pull-requests') {
      options.pullRequests = parsePullRequestNumbers(readArgument(args, index));
      index += 1;
    } else if (argument === '--json-out') {
      options.jsonOut = readArgument(args, index);
      index += 1;
    } else if (argument === '--markdown-out') {
      options.markdownOut = readArgument(args, index);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository)) {
    throw new Error(
      '--repository or GITHUB_REPOSITORY must be an owner/name pair',
    );
  }
  if (
    !Number.isInteger(options.limit) ||
    options.limit < DEFAULT_LIMIT ||
    options.limit > MAX_LIMIT
  ) {
    throw new Error(
      `--limit must be between ${DEFAULT_LIMIT} and ${MAX_LIMIT}`,
    );
  }
  if (options.pullRequests.length > MAX_LIMIT) {
    throw new Error(`--pull-requests accepts at most ${MAX_LIMIT} numbers`);
  }

  return options;
}

function writeReport(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
}

async function runCli(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: the standalone manual workflow injects this read-only token outside Turbo.
  const token = process.env.GITHUB_TOKEN;
  if (token === undefined || token.trim().length === 0) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const client = createGitHubClient(token);
  const mode = options.pullRequests.length > 0 ? 'explicit' : 'recent-merged';
  const pullRequests =
    mode === 'explicit'
      ? await Promise.all(
          options.pullRequests.map((number) =>
            getPullRequest(client, options.repository, number),
          ),
        )
      : await getRecentMergedPullRequests(
          client,
          options.repository,
          options.limit,
        );
  const observations: PullRequestValidationObservation[] = [];

  for (const pullRequest of pullRequests) {
    observations.push(
      await collectObservation(client, options.repository, pullRequest),
    );
  }

  const report = buildPullRequestValidationReport({
    limit: mode === 'recent-merged' ? options.limit : null,
    mode,
    observations,
    pullRequests: pullRequests.map((pullRequest) => pullRequest.number),
    repository: options.repository,
  });
  writeReport(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  writeReport(options.markdownOut, formatPullRequestValidationMarkdown(report));

  process.stdout.write(
    `Collected ${report.summary.pullRequests} pull requests: ${report.summary.byDisposition.ready} ready, ${report.summary.byDisposition.failed} failed, ${report.summary.byDisposition.incomplete} incomplete.\n`,
  );
  if (report.summary.byDisposition.incomplete > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
