import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_VERSION = '1.1';
const GITHUB_API_VERSION = '2026-03-10';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGES = 100;
const MAX_SEARCH_RESULTS = 1_000;
const MAX_SEARCH_WINDOW_DAYS = 36_500;
const MAX_CONCURRENT_GITHUB_REQUESTS = 8;
const MAX_PULL_REQUEST_COMMITS = 250;

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
  runAttempt: number;
  startedAt: string | null;
  status: string;
  url: string;
  workflowId: number;
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

export type SupersededCancellationDisposition =
  | 'cancelled-safe'
  | 'cancelled-unresolved'
  | 'not-cancelled';

export type WorkflowJobEvidence = {
  completedAt: string | null;
  conclusion: string | null;
  id: number;
  name: string;
  runAttempt: number;
  runnerName: string | null;
  runnerTimeMs: number | null;
  startedAt: string | null;
  status: string;
};

export type SupersededWorkflowRunEvidence = {
  cancellationDisposition: SupersededCancellationDisposition;
  conclusion: string | null;
  discardedRunnerTimeMs: number | null;
  headSha: string;
  id: number;
  incompleteReasons: string[];
  jobs: WorkflowJobEvidence[];
  name: string;
  replacement: {
    headSha: string;
    runAttempt: number;
    runId: number;
  } | null;
  runAttempt: number;
  status: string;
  url: string;
  workflowId: number;
};

export type SupersededValidationEvidence = {
  headShas: string[];
  incompleteReasons: string[];
  runs: SupersededWorkflowRunEvidence[];
  summary: {
    cancelledSafe: number;
    cancelledUnresolved: number;
    discardedRunnerTimeMs: number | null;
    notCancelled: number;
    runs: number;
  };
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
  supersededValidation: SupersededValidationEvidence;
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
    supersededValidation: {
      cancelledSafe: number;
      cancelledUnresolved: number;
      discardedRunnerTimeMs: number | null;
      pullRequests: number;
      runs: number;
    };
  };
  version: typeof REPORT_VERSION;
};

export type GitHubPullRequest = {
  base: { ref: string; sha: string };
  changed_files: number;
  created_at: string;
  head: { ref: string; repo: { full_name: string } | null; sha: string };
  html_url: string;
  merged_at: string | null;
  number: number;
  title: string;
};

export type GitHubWorkflowRun = {
  conclusion: string | null;
  created_at: string;
  head_branch: string | null;
  head_repository: { full_name: string } | null;
  head_sha: string;
  html_url: string;
  id: number;
  name: string;
  pull_requests: Array<{ number: number }>;
  run_attempt: number;
  run_started_at: string | null;
  status: string;
  updated_at: string;
  workflow_id: number;
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

export type GitHubPullRequestCommit = {
  sha: string;
};

export type GitHubWorkflowJob = {
  completed_at: string | null;
  conclusion: string | null;
  id: number;
  name: string;
  run_attempt: number;
  runner_name: string | null;
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
  supersededValidation?: SupersededValidationEvidence;
  workflowRuns: readonly GitHubWorkflowRun[];
};

export type WorkflowJobsCollection = {
  complete: boolean;
  error: string | null;
  jobs: GitHubWorkflowJob[];
  runAttempt: number;
  runId: number;
};

type SupersededValidationInput = {
  collectionErrors?: readonly string[];
  finalHeadSha: string;
  headShas: readonly string[];
  jobs: readonly WorkflowJobsCollection[];
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
const REPLACEMENT_CONCLUSIONS = new Set(['failure', ...READY_CONCLUSIONS]);

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
    typeof value.head.ref === 'string' &&
    value.head.ref.trim().length > 0 &&
    (value.head.repo === null ||
      (isRecord(value.head.repo) &&
        typeof value.head.repo.full_name === 'string')) &&
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

function isGitHubPullRequestCommit(
  value: unknown,
): value is GitHubPullRequestCommit {
  return isRecord(value) && isGitSha(value.sha);
}

function isGitHubWorkflowRun(value: unknown): value is GitHubWorkflowRun {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === 'string' &&
    (typeof value.head_branch === 'string' || value.head_branch === null) &&
    (value.head_repository === null ||
      (isRecord(value.head_repository) &&
        typeof value.head_repository.full_name === 'string')) &&
    isGitSha(value.head_sha) &&
    Array.isArray(value.pull_requests) &&
    value.pull_requests.every(
      (pullRequest) =>
        isRecord(pullRequest) &&
        typeof pullRequest.number === 'number' &&
        Number.isInteger(pullRequest.number) &&
        pullRequest.number > 0,
    ) &&
    typeof value.workflow_id === 'number' &&
    Number.isInteger(value.workflow_id) &&
    value.workflow_id > 0 &&
    typeof value.run_attempt === 'number' &&
    Number.isInteger(value.run_attempt) &&
    value.run_attempt > 0 &&
    typeof value.status === 'string' &&
    (typeof value.conclusion === 'string' || value.conclusion === null) &&
    typeof value.created_at === 'string' &&
    (typeof value.run_started_at === 'string' ||
      value.run_started_at === null) &&
    typeof value.updated_at === 'string' &&
    typeof value.html_url === 'string'
  );
}

function isGitHubWorkflowJob(value: unknown): value is GitHubWorkflowJob {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === 'string' &&
    typeof value.status === 'string' &&
    (typeof value.conclusion === 'string' || value.conclusion === null) &&
    (typeof value.started_at === 'string' || value.started_at === null) &&
    (typeof value.completed_at === 'string' || value.completed_at === null) &&
    (typeof value.runner_name === 'string' || value.runner_name === null) &&
    typeof value.run_attempt === 'number' &&
    Number.isInteger(value.run_attempt) &&
    value.run_attempt > 0
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

export async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer');
  }

  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item !== undefined) {
          results[index] = await mapper(item, index);
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function isWorkflowRunAssociatedWithPullRequest(
  run: GitHubWorkflowRun,
  pullRequest: GitHubPullRequest,
): boolean {
  if (run.pull_requests.length > 0) {
    return run.pull_requests.some(
      (associatedPullRequest) =>
        associatedPullRequest.number === pullRequest.number,
    );
  }

  return (
    pullRequest.head.repo !== null &&
    run.head_branch === pullRequest.head.ref &&
    run.head_repository?.full_name === pullRequest.head.repo.full_name
  );
}

export function pullRequestCommitCapReason(commitCount: number): string | null {
  return commitCount >= MAX_PULL_REQUEST_COMMITS
    ? `Pull-request commit collection reached GitHub's ${MAX_PULL_REQUEST_COMMITS}-commit retrieval cap.`
    : null;
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
    runAttempt: run.run_attempt,
    startedAt: run.run_started_at,
    status: run.status,
    url: run.html_url,
    workflowId: run.workflow_id,
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

function workflowJobEvidence(job: GitHubWorkflowJob): WorkflowJobEvidence {
  return {
    completedAt: job.completed_at,
    conclusion: job.conclusion,
    id: job.id,
    name: job.name,
    runAttempt: job.run_attempt,
    runnerName: job.runner_name,
    runnerTimeMs:
      job.runner_name === null
        ? 0
        : durationBetween(job.started_at, job.completed_at),
    startedAt: job.started_at,
    status: job.status,
  };
}

function jobContractCounts(
  jobs: readonly GitHubWorkflowJob[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.name, (counts.get(job.name) ?? 0) + 1);
  }
  return counts;
}

function coversJobContract(
  original: readonly GitHubWorkflowJob[],
  replacement: readonly GitHubWorkflowJob[],
): boolean {
  if (original.length === 0) {
    return false;
  }

  const originalCounts = jobContractCounts(original);
  const replacementCounts = jobContractCounts(replacement);

  for (const [name, count] of originalCounts) {
    if ((replacementCounts.get(name) ?? 0) < count) {
      return false;
    }
  }

  return replacement.every(
    (job) =>
      job.status === 'completed' &&
      job.conclusion !== null &&
      REPLACEMENT_CONCLUSIONS.has(job.conclusion),
  );
}

function workflowRunOrder(
  run: GitHubWorkflowRun,
  headIndexes: ReadonlyMap<string, number>,
): [number, number, number, number] {
  return [
    headIndexes.get(run.head_sha) ?? Number.MAX_SAFE_INTEGER,
    parseTimestamp(run.created_at) ?? Number.MAX_SAFE_INTEGER,
    run.id,
    run.run_attempt,
  ];
}

function compareWorkflowRuns(
  left: GitHubWorkflowRun,
  right: GitHubWorkflowRun,
  headIndexes: ReadonlyMap<string, number>,
): number {
  if (left.id === right.id) {
    return left.run_attempt - right.run_attempt;
  }
  const leftOrder = workflowRunOrder(left, headIndexes);
  const rightOrder = workflowRunOrder(right, headIndexes);
  return (
    leftOrder[0] - rightOrder[0] ||
    leftOrder[1] - rightOrder[1] ||
    leftOrder[2] - rightOrder[2] ||
    leftOrder[3] - rightOrder[3]
  );
}

export function buildSupersededValidationEvidence(
  input: SupersededValidationInput,
): SupersededValidationEvidence {
  const incompleteReasons = [...(input.collectionErrors ?? [])];
  let historyComplete = incompleteReasons.length === 0;
  const headShas = [...new Set(input.headShas)];
  if (headShas.length !== input.headShas.length) {
    historyComplete = false;
    incompleteReasons.push(
      'Pull-request commit collection returned duplicate SHAs.',
    );
  }

  const finalHeadIndex = headShas.indexOf(input.finalHeadSha);
  if (finalHeadIndex === -1) {
    historyComplete = false;
    incompleteReasons.push(
      'Pull-request commit collection did not contain the final head SHA.',
    );
  } else if (finalHeadIndex !== headShas.length - 1) {
    historyComplete = false;
    incompleteReasons.push(
      'Pull-request commit collection did not end at the final head SHA.',
    );
  }

  const headIndexes = new Map(
    headShas.map((headSha, index) => [headSha, index] as const),
  );
  const jobsByRunAttempt = new Map(
    input.jobs.map(
      (collection) =>
        [`${collection.runId}:${collection.runAttempt}`, collection] as const,
    ),
  );
  const orderedRuns = [...input.workflowRuns].sort((left, right) =>
    compareWorkflowRuns(left, right, headIndexes),
  );
  const supersededRuns = orderedRuns.filter((run) => {
    const index = headIndexes.get(run.head_sha);
    return index !== undefined && index < finalHeadIndex;
  });

  for (const run of input.workflowRuns) {
    if (!headIndexes.has(run.head_sha)) {
      historyComplete = false;
      incompleteReasons.push(
        `Workflow run ${run.id} targeted a SHA outside the pull-request commit history.`,
      );
    }
  }

  const runs = supersededRuns.map((run): SupersededWorkflowRunEvidence => {
    const runReasons: string[] = [];
    const jobCollection = jobsByRunAttempt.get(`${run.id}:${run.run_attempt}`);
    if (jobCollection === undefined) {
      runReasons.push(`Workflow run ${run.id} job collection is missing.`);
    } else if (!jobCollection.complete) {
      runReasons.push(
        `Workflow run ${run.id} job collection: ${jobCollection.error ?? 'incomplete'}`,
      );
    }

    const jobs = (jobCollection?.jobs ?? [])
      .map(workflowJobEvidence)
      .sort((left, right) => left.id - right.id);
    for (const job of jobs) {
      if (job.runnerName !== null && job.runnerTimeMs === null) {
        runReasons.push(`Workflow job ${job.id} has incomplete runner timing.`);
      }
    }

    const discardedRunnerTimeMs =
      jobCollection?.complete === true &&
      jobs.every((job) => job.runnerTimeMs !== null)
        ? jobs.reduce((total, job) => total + (job.runnerTimeMs ?? 0), 0)
        : null;

    let replacement: SupersededWorkflowRunEvidence['replacement'] = null;
    let cancellationDisposition: SupersededCancellationDisposition =
      'not-cancelled';
    if (run.conclusion === 'cancelled') {
      const replacementRun = orderedRuns.find((candidate) => {
        const runHeadIndex = headIndexes.get(run.head_sha);
        const candidateHeadIndex = headIndexes.get(candidate.head_sha);
        if (
          candidate.workflow_id !== run.workflow_id ||
          runHeadIndex === undefined ||
          candidateHeadIndex === undefined ||
          candidateHeadIndex <= runHeadIndex ||
          candidate.status !== 'completed' ||
          candidate.conclusion === null ||
          !REPLACEMENT_CONCLUSIONS.has(candidate.conclusion)
        ) {
          return false;
        }

        const candidateJobs = jobsByRunAttempt.get(
          `${candidate.id}:${candidate.run_attempt}`,
        );
        return (
          jobCollection?.complete === true &&
          candidateJobs?.complete === true &&
          coversJobContract(
            jobCollection.jobs.filter(
              (job) => job.run_attempt === run.run_attempt,
            ),
            candidateJobs.jobs.filter(
              (job) => job.run_attempt === candidate.run_attempt,
            ),
          )
        );
      });

      if (replacementRun === undefined) {
        cancellationDisposition = 'cancelled-unresolved';
        runReasons.push(
          `No later terminal run fully replaced workflow ${run.workflow_id}'s job contract.`,
        );
      } else {
        cancellationDisposition = 'cancelled-safe';
        replacement = {
          headSha: replacementRun.head_sha,
          runAttempt: replacementRun.run_attempt,
          runId: replacementRun.id,
        };
      }
    }

    incompleteReasons.push(...runReasons);
    return {
      cancellationDisposition,
      conclusion: run.conclusion,
      discardedRunnerTimeMs,
      headSha: run.head_sha,
      id: run.id,
      incompleteReasons: [...new Set(runReasons)].sort(),
      jobs,
      name: run.name,
      replacement,
      runAttempt: run.run_attempt,
      status: run.status,
      url: run.html_url,
      workflowId: run.workflow_id,
    };
  });

  const discardedRunnerTimeMs =
    historyComplete && runs.every((run) => run.discardedRunnerTimeMs !== null)
      ? runs.reduce((total, run) => total + (run.discardedRunnerTimeMs ?? 0), 0)
      : null;

  return {
    headShas,
    incompleteReasons: [...new Set(incompleteReasons)].sort(),
    runs,
    summary: {
      cancelledSafe: runs.filter(
        (run) => run.cancellationDisposition === 'cancelled-safe',
      ).length,
      cancelledUnresolved: runs.filter(
        (run) => run.cancellationDisposition === 'cancelled-unresolved',
      ).length,
      discardedRunnerTimeMs,
      notCancelled: runs.filter(
        (run) => run.cancellationDisposition === 'not-cancelled',
      ).length,
      runs: runs.length,
    },
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
  const supersededValidation =
    input.supersededValidation ??
    buildSupersededValidationEvidence({
      finalHeadSha: input.pullRequest.head.sha,
      headShas: [input.pullRequest.head.sha],
      jobs: [],
      workflowRuns: input.workflowRuns,
    });

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
    supersededValidation,
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
  const supersededObservations = observations.filter(
    (observation) => observation.supersededValidation.summary.runs > 0,
  );
  const supersededDiscardedRunnerTimeMs = observations.every(
    (observation) =>
      observation.supersededValidation.summary.discardedRunnerTimeMs !== null,
  )
    ? observations.reduce(
        (total, observation) =>
          total +
          (observation.supersededValidation.summary.discardedRunnerTimeMs ?? 0),
        0,
      )
    : null;

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
      supersededValidation: {
        cancelledSafe: observations.reduce(
          (total, observation) =>
            total + observation.supersededValidation.summary.cancelledSafe,
          0,
        ),
        cancelledUnresolved: observations.reduce(
          (total, observation) =>
            total +
            observation.supersededValidation.summary.cancelledUnresolved,
          0,
        ),
        discardedRunnerTimeMs: supersededDiscardedRunnerTimeMs,
        pullRequests: supersededObservations.length,
        runs: observations.reduce(
          (total, observation) =>
            total + observation.supersededValidation.summary.runs,
          0,
        ),
      },
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
    `- Superseded validation: ${report.summary.supersededValidation.runs} runs across ${report.summary.supersededValidation.pullRequests} pull requests; ${report.summary.supersededValidation.cancelledSafe} safely replaced cancellations, ${report.summary.supersededValidation.cancelledUnresolved} unresolved cancellations`,
    `- Estimated discarded runner time: ${formatDuration(report.summary.supersededValidation.discardedRunnerTimeMs)}`,
    '',
    '| PR | Surface | Base | Head | Disposition | Queue | Execution | Critical path | Slowest check | Superseded runs | Discarded runner time |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |',
  ];

  for (const observation of report.observations) {
    const slowest = observation.slowestChecks[0];
    const superseded = observation.supersededValidation.summary;
    lines.push(
      `| [#${observation.identity.number}](${observation.identity.url}) ${escapeTable(observation.identity.title)} | ${observation.surface} | ${escapeTable(observation.identity.baseBranch)}@\`${observation.identity.baseSha.slice(0, 12)}\` | \`${observation.identity.headSha.slice(0, 12)}\` | ${observation.disposition} | ${formatDuration(observation.timing.queueDelayMs)} | ${formatDuration(observation.timing.executionDurationMs)} | ${formatDuration(observation.timing.criticalPathMs)} | ${slowest ? `${escapeTable(slowest.name)} (${formatDuration(slowest.durationMs)})` : 'n/a'} | ${superseded.runs} | ${formatDuration(superseded.discardedRunnerTimeMs)} |`,
    );

    if (observation.incompleteReasons.length > 0) {
      lines.push(
        `|  |  |  |  | Reasons |  |  |  | ${escapeTable(observation.incompleteReasons.join('; '))} |  |  |`,
      );
    }
    if (observation.supersededValidation.incompleteReasons.length > 0) {
      lines.push(
        `|  |  |  |  | Superseded evidence |  |  |  | ${escapeTable(observation.supersededValidation.incompleteReasons.join('; '))} |  |  |`,
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

type WorkflowRunAttemptsCollection = {
  complete: boolean;
  error: string | null;
  runs: GitHubWorkflowRun[];
};

async function collectWorkflowRunAttempts(
  client: GitHubClient,
  repository: string,
  pullRequest: GitHubPullRequest,
  run: GitHubWorkflowRun,
): Promise<WorkflowRunAttemptsCollection> {
  if (run.run_attempt === 1) {
    return { complete: true, error: null, runs: [run] };
  }

  const priorAttempts = Array.from(
    { length: run.run_attempt - 1 },
    (_, index) => index + 1,
  );
  const results: Array<{ error: string | null; run: GitHubWorkflowRun | null }> =
    [];
  // The caller owns the global request concurrency. Keep attempts within each
  // run sequential so nested fan-out cannot multiply that limit.
  for (const attempt of priorAttempts) {
    try {
      const page = await client.loadPage(
        `/repos/${repository}/actions/runs/${run.id}/attempts/${attempt}`,
      );
      if (!isGitHubWorkflowRun(page.data)) {
        throw new Error('Workflow run attempt returned an invalid response');
      }
      if (!isWorkflowRunAssociatedWithPullRequest(page.data, pullRequest)) {
        throw new Error(
          `Workflow run ${run.id} attempt ${attempt} is not associated with pull request #${pullRequest.number}`,
        );
      }
      results.push({ error: null, run: page.data });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        run: null,
      });
    }
  }
  const errors = results
    .map((result) => result.error)
    .filter((error): error is string => error !== null);

  return {
    complete: errors.length === 0,
    error: errors.length === 0 ? null : errors.join('; '),
    runs: [
      ...results
        .map((result) => result.run)
        .filter((attempt): attempt is GitHubWorkflowRun => attempt !== null),
      run,
    ].sort((left, right) => left.run_attempt - right.run_attempt),
  };
}

async function collectObservation(
  client: GitHubClient,
  repository: string,
  pullRequest: GitHubPullRequest,
): Promise<PullRequestValidationObservation> {
  const [filesResult, commitsResult, checksResult] = await Promise.all([
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
      `/repos/${repository}/pulls/${pullRequest.number}/commits?per_page=100`,
      client.loadPage,
      (data) =>
        parseTypedArray(
          requireArray(data, 'Pull-request commits'),
          isGitHubPullRequestCommit,
          'Pull-request commits',
        ),
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
  const commitHeadShas = commitsResult.items.map((commit) => commit.sha);
  const queriedHeadShas = [
    ...new Set([...commitHeadShas, pullRequest.head.sha]),
  ];
  const workflowResults = await mapWithConcurrency(
    queriedHeadShas,
    MAX_CONCURRENT_GITHUB_REQUESTS,
    async (headSha) => {
      const result = await collectPaginated(
        `/repos/${repository}/actions/runs?event=pull_request&head_sha=${encodeURIComponent(headSha)}&per_page=100`,
        client.loadPage,
        (data) =>
          parseTypedArray(
            requireArrayProperty(data, 'workflow_runs', 'Workflow runs'),
            isGitHubWorkflowRun,
            'Workflow runs',
          ),
        (data) => requireTotalCount(data, 'Workflow runs'),
      );
      return {
        headSha,
        result: {
          ...result,
          items: result.items.filter((run) =>
            isWorkflowRunAssociatedWithPullRequest(run, pullRequest),
          ),
        },
      };
    },
  );
  const latestWorkflowRuns = [
    ...new Map(
      workflowResults
        .flatMap(({ result }) => result.items)
        .map((run) => [run.id, run] as const),
    ).values(),
  ];
  const attemptResults = await mapWithConcurrency(
    latestWorkflowRuns,
    MAX_CONCURRENT_GITHUB_REQUESTS,
    (run) => collectWorkflowRunAttempts(client, repository, pullRequest, run),
  );
  const workflowRunAttempts = [
    ...new Map(
      attemptResults
        .flatMap((result) => result.runs)
        .map((run) => [`${run.id}:${run.run_attempt}`, run] as const),
    ).values(),
  ];
  const jobResults: WorkflowJobsCollection[] = await mapWithConcurrency(
    workflowRunAttempts,
    MAX_CONCURRENT_GITHUB_REQUESTS,
    async (run) => {
      const result = await collectPaginated(
        `/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        client.loadPage,
        (data) =>
          parseTypedArray(
            requireArrayProperty(data, 'jobs', 'Workflow jobs'),
            isGitHubWorkflowJob,
            'Workflow jobs',
          ),
        (data) => requireTotalCount(data, 'Workflow jobs'),
      );
      const hasMismatchedAttempt = result.items.some(
        (job) => job.run_attempt !== run.run_attempt,
      );
      return {
        complete: result.complete && !hasMismatchedAttempt,
        error: hasMismatchedAttempt
          ? `Workflow jobs did not all belong to attempt ${run.run_attempt}`
          : result.error,
        jobs: result.items.filter((job) => job.run_attempt === run.run_attempt),
        runAttempt: run.run_attempt,
        runId: run.id,
      };
    },
  );
  const finalWorkflowResult = workflowResults.find(
    ({ headSha }) => headSha === pullRequest.head.sha,
  )?.result;
  const collectionErrors = [
    filesResult.complete
      ? null
      : `Changed-file collection: ${filesResult.error}`,
    finalWorkflowResult?.complete === true
      ? null
      : `Workflow-run collection: ${finalWorkflowResult?.error ?? 'missing final-head result'}`,
    checksResult.complete
      ? null
      : `Check-run collection: ${checksResult.error}`,
  ].filter((reason): reason is string => reason !== null);
  const supersededCollectionErrors = [
    commitsResult.complete
      ? null
      : `Pull-request commit collection: ${commitsResult.error}`,
    pullRequestCommitCapReason(commitsResult.items.length),
    ...workflowResults.map(({ headSha, result }) =>
      result.complete
        ? null
        : `Workflow-run collection for ${headSha}: ${result.error}`,
    ),
    ...attemptResults.map((result) =>
      result.complete
        ? null
        : `Workflow-run attempt collection: ${result.error}`,
    ),
    ...jobResults.map((result) =>
      result.complete
        ? null
        : `Workflow job collection for run ${result.runId} attempt ${result.runAttempt}: ${result.error}`,
    ),
  ].filter((reason): reason is string => reason !== null);
  const supersededValidation = buildSupersededValidationEvidence({
    collectionErrors: supersededCollectionErrors,
    finalHeadSha: pullRequest.head.sha,
    headShas: commitHeadShas,
    jobs: jobResults,
    workflowRuns: workflowRunAttempts,
  });

  return buildPullRequestObservation({
    checkRuns: checksResult.items,
    collectionErrors,
    files: filesResult.items.map((file) => file.filename),
    pullRequest,
    repository,
    supersededValidation,
    workflowRuns: finalWorkflowResult?.items ?? [],
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
