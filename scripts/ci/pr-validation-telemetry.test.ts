import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPullRequestObservation,
  buildPullRequestValidationReport,
  buildSupersededValidationEvidence,
  classifyPullRequestSurface,
  collectPaginated,
  findMergedPullRequestSearchWindow,
  formatPullRequestValidationMarkdown,
  type GitHubCheckRun,
  type GitHubPullRequest,
  type GitHubWorkflowJob,
  type GitHubWorkflowRun,
  isWorkflowRunAssociatedWithPullRequest,
  mapWithConcurrency,
  parseCliOptions,
  pullRequestCommitCapReason,
  selectRecentMergedPullRequestNumbers,
} from './pr-validation-telemetry';

const HEAD_SHA = 'a'.repeat(40);
const SUPERSEDED_SHA = 'c'.repeat(40);
const PULL_REQUEST: GitHubPullRequest = {
  base: { ref: 'master', sha: 'b'.repeat(40) },
  changed_files: 1,
  created_at: '2026-07-20T09:00:00.000Z',
  head: {
    ref: 'codex/123-validation-evidence',
    repo: { full_name: 'genfeedai/genfeed.ai' },
    sha: HEAD_SHA,
  },
  html_url: 'https://github.com/genfeedai/genfeed.ai/pull/123',
  merged_at: '2026-07-20T11:00:00.000Z',
  number: 123,
  title: 'Measure validation evidence',
};
const WORKFLOW_RUN: GitHubWorkflowRun = {
  conclusion: 'success',
  created_at: '2026-07-20T10:00:00.000Z',
  head_branch: PULL_REQUEST.head.ref,
  head_repository: { full_name: 'genfeedai/genfeed.ai' },
  head_sha: HEAD_SHA,
  html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/10',
  id: 10,
  name: 'CI',
  pull_requests: [{ number: PULL_REQUEST.number }],
  run_attempt: 1,
  run_started_at: '2026-07-20T10:00:30.000Z',
  status: 'completed',
  updated_at: '2026-07-20T10:03:00.000Z',
  workflow_id: 100,
};
const CHECK_RUN: GitHubCheckRun = {
  completed_at: '2026-07-20T10:04:00.000Z',
  conclusion: 'success',
  head_sha: HEAD_SHA,
  html_url: 'https://github.com/genfeedai/genfeed.ai/runs/20',
  id: 20,
  name: 'Tests',
  started_at: '2026-07-20T10:01:00.000Z',
  status: 'completed',
};
const WORKFLOW_JOB: GitHubWorkflowJob = {
  completed_at: '2026-07-20T10:01:06.000Z',
  conclusion: 'cancelled',
  id: 30,
  name: 'Tests',
  run_attempt: 1,
  runner_name: 'GitHub Actions 1',
  started_at: '2026-07-20T10:01:00.000Z',
  status: 'completed',
};

function buildObservation(
  options: {
    checkRuns?: GitHubCheckRun[];
    collectionErrors?: string[];
    files?: string[];
    workflowRuns?: GitHubWorkflowRun[];
  } = {},
) {
  return buildPullRequestObservation({
    checkRuns: options.checkRuns ?? [CHECK_RUN],
    collectionErrors: options.collectionErrors,
    files: options.files ?? ['apps/app/src/page.tsx'],
    pullRequest: PULL_REQUEST,
    repository: 'genfeedai/genfeed.ai',
    workflowRuns: options.workflowRuns ?? [WORKFLOW_RUN],
  });
}

function supersededRun(
  overrides: Partial<GitHubWorkflowRun> = {},
): GitHubWorkflowRun {
  return {
    ...WORKFLOW_RUN,
    conclusion: 'cancelled',
    created_at: '2026-07-20T09:30:00.000Z',
    head_sha: SUPERSEDED_SHA,
    id: 9,
    run_started_at: '2026-07-20T09:30:00.000Z',
    updated_at: '2026-07-20T09:31:00.000Z',
    ...overrides,
  };
}

function replacementRun(
  overrides: Partial<GitHubWorkflowRun> = {},
): GitHubWorkflowRun {
  return {
    ...WORKFLOW_RUN,
    conclusion: 'success',
    head_sha: HEAD_SHA,
    ...overrides,
  };
}

function jobsCollection(
  runId: number,
  jobs: GitHubWorkflowJob[],
  options: { complete?: boolean; error?: string | null } = {},
) {
  return {
    complete: options.complete ?? true,
    error: options.error ?? null,
    jobs,
    runAttempt: jobs[0]?.run_attempt ?? 1,
    runId,
  };
}

describe('pull-request validation telemetry', () => {
  it('binds complete timing evidence to the exact final head', () => {
    const observation = buildObservation();

    expect(observation.disposition).toBe('ready');
    expect(observation.identity).toMatchObject({
      baseBranch: 'master',
      baseSha: 'b'.repeat(40),
      headSha: HEAD_SHA,
      number: 123,
      repository: 'genfeedai/genfeed.ai',
    });
    expect(observation.timing).toEqual({
      criticalPathMs: 240_000,
      executionDurationMs: 150_000,
      queueDelayMs: 30_000,
    });
    expect(observation.slowestChecks).toEqual([
      {
        durationMs: 180_000,
        name: 'Tests',
        url: CHECK_RUN.html_url,
      },
    ]);
  });

  it('marks missing timestamps and incomplete REST pages incomplete', () => {
    const observation = buildObservation({
      checkRuns: [{ ...CHECK_RUN, started_at: null }],
      collectionErrors: ['Check-run collection: page 2 failed'],
    });

    expect(observation.disposition).toBe('incomplete');
    expect(observation.incompleteReasons).toContain(
      'Check-run collection: page 2 failed',
    );
    expect(observation.incompleteReasons).toContain(
      'Check run 20 has incomplete timing.',
    );
  });

  it('fails closed when GitHub reports more changed files than were collected', () => {
    const observation = buildPullRequestObservation({
      checkRuns: [CHECK_RUN],
      files: ['apps/app/src/page.tsx'],
      pullRequest: { ...PULL_REQUEST, changed_files: 2 },
      repository: 'genfeedai/genfeed.ai',
      workflowRuns: [WORKFLOW_RUN],
    });

    expect(observation.disposition).toBe('incomplete');
    expect(observation.incompleteReasons).toContain(
      'Changed-file collection returned 1 of 2 files.',
    );
  });

  it('never reports mismatched-head evidence as ready', () => {
    const observation = buildObservation({
      checkRuns: [{ ...CHECK_RUN, head_sha: 'b'.repeat(40) }],
    });

    expect(observation.disposition).toBe('incomplete');
    expect(observation.checks).toEqual([]);
    expect(observation.incompleteReasons).toContain(
      '1 check run(s) targeted another head SHA.',
    );
  });

  it('distinguishes cancelled validation from an intentional skipped check', () => {
    const cancelled = buildObservation({
      checkRuns: [{ ...CHECK_RUN, conclusion: 'cancelled' }],
    });
    const skipped = buildObservation({
      checkRuns: [{ ...CHECK_RUN, conclusion: 'skipped' }],
    });

    expect(cancelled.disposition).toBe('failed');
    expect(skipped.disposition).toBe('ready');
  });

  it('associates superseded runs with their exact SHA and proves a later replacement contract', () => {
    const cancelled = supersededRun();
    const replacement = replacementRun();
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(cancelled.id, [WORKFLOW_JOB]),
        jobsCollection(replacement.id, [
          {
            ...WORKFLOW_JOB,
            conclusion: 'success',
            id: 31,
            runner_name: 'GitHub Actions 2',
          },
        ]),
      ],
      workflowRuns: [cancelled, replacement],
    });

    expect(evidence.runs).toHaveLength(1);
    expect(evidence.runs[0]).toMatchObject({
      cancellationDisposition: 'cancelled-safe',
      discardedRunnerTimeMs: 6_000,
      headSha: SUPERSEDED_SHA,
      replacement: { headSha: HEAD_SHA, runId: replacement.id },
      workflowId: WORKFLOW_RUN.workflow_id,
    });
    expect(evidence.summary).toEqual({
      cancelledSafe: 1,
      cancelledUnresolved: 0,
      discardedRunnerTimeMs: 6_000,
      notCancelled: 0,
      runs: 1,
    });
  });

  it('keeps empty or partially collected cancelled job contracts unresolved', () => {
    const empty = supersededRun();
    const incomplete = supersededRun({ id: 8, workflow_id: 101 });
    const replacement = replacementRun();
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(empty.id, []),
        jobsCollection(incomplete.id, [WORKFLOW_JOB], {
          complete: false,
          error: 'page 2 failed',
        }),
        jobsCollection(replacement.id, [
          { ...WORKFLOW_JOB, conclusion: 'success', id: 31 },
        ]),
      ],
      workflowRuns: [empty, incomplete, replacement],
    });

    expect(evidence.summary.cancelledUnresolved).toBe(2);
    expect(evidence.summary.discardedRunnerTimeMs).toBeNull();
    expect(
      evidence.runs
        .find((run) => run.id === empty.id)
        ?.incompleteReasons.join(' '),
    ).toContain('No later terminal run fully replaced');
    expect(
      evidence.runs
        .find((run) => run.id === incomplete.id)
        ?.incompleteReasons.join(' '),
    ).toContain('page 2 failed');
  });

  it('requires a later head with a complete superset of terminal jobs', () => {
    const cancelled = supersededRun();
    const sameHeadReplacement = replacementRun({
      head_sha: SUPERSEDED_SHA,
      id: 11,
    });
    const incompleteReplacement = replacementRun({ id: 12 });
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(cancelled.id, [
          WORKFLOW_JOB,
          { ...WORKFLOW_JOB, id: 32 },
        ]),
        jobsCollection(sameHeadReplacement.id, [
          { ...WORKFLOW_JOB, conclusion: 'success', id: 33 },
          { ...WORKFLOW_JOB, conclusion: 'success', id: 34 },
        ]),
        jobsCollection(incompleteReplacement.id, [
          { ...WORKFLOW_JOB, conclusion: 'success', id: 35 },
        ]),
      ],
      workflowRuns: [cancelled, sameHeadReplacement, incompleteReplacement],
    });

    expect(evidence.runs[0]?.cancellationDisposition).toBe(
      'cancelled-unresolved',
    );
    expect(evidence.runs[0]?.replacement).toBeNull();
  });

  it('sums only assigned runner occupancy across all obsolete runs', () => {
    const completed = supersededRun({
      conclusion: 'success',
      id: 7,
      workflow_id: 102,
    });
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(completed.id, [
          { ...WORKFLOW_JOB, id: 40 },
          {
            ...WORKFLOW_JOB,
            completed_at: '2026-07-20T09:59:59.000Z',
            id: 41,
            runner_name: null,
          },
        ]),
      ],
      workflowRuns: [completed],
    });

    expect(evidence.runs[0]).toMatchObject({
      cancellationDisposition: 'not-cancelled',
      discardedRunnerTimeMs: 6_000,
    });
    expect(evidence.summary.discardedRunnerTimeMs).toBe(6_000);
  });

  it('does not report a total when assigned runner timing is invalid', () => {
    const completed = supersededRun({
      conclusion: 'success',
      id: 6,
      workflow_id: 103,
    });
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(completed.id, [
          {
            ...WORKFLOW_JOB,
            completed_at: '2026-07-20T10:00:59.000Z',
            id: 42,
          },
        ]),
      ],
      workflowRuns: [completed],
    });

    expect(evidence.runs[0]?.discardedRunnerTimeMs).toBeNull();
    expect(evidence.summary.discardedRunnerTimeMs).toBeNull();
    expect(evidence.incompleteReasons.join(' ')).toContain(
      'incomplete runner timing',
    );
  });

  it('keeps rerun attempts distinct and measures each attempt once', () => {
    const cancelledAttempt = supersededRun({ run_attempt: 1 });
    const successfulAttempt = supersededRun({
      conclusion: 'success',
      run_attempt: 2,
    });
    const replacement = replacementRun();
    const evidence = buildSupersededValidationEvidence({
      finalHeadSha: HEAD_SHA,
      headShas: [SUPERSEDED_SHA, HEAD_SHA],
      jobs: [
        jobsCollection(cancelledAttempt.id, [WORKFLOW_JOB]),
        jobsCollection(successfulAttempt.id, [
          {
            ...WORKFLOW_JOB,
            completed_at: '2026-07-20T10:01:04.000Z',
            id: 31,
            run_attempt: 2,
          },
        ]),
        jobsCollection(replacement.id, [
          { ...WORKFLOW_JOB, conclusion: 'success', id: 32 },
        ]),
      ],
      workflowRuns: [cancelledAttempt, successfulAttempt, replacement],
    });

    expect(evidence.runs).toHaveLength(2);
    expect(evidence.runs.map((run) => run.runAttempt)).toEqual([1, 2]);
    expect(evidence.runs[0]).toMatchObject({
      cancellationDisposition: 'cancelled-safe',
      replacement: { runAttempt: 1, runId: replacement.id },
    });
    expect(evidence.summary.discardedRunnerTimeMs).toBe(10_000);
  });

  it('fails closed instead of presenting a partial historical total', () => {
    const supersededValidation = buildSupersededValidationEvidence({
      collectionErrors: ['Workflow-run collection for ccc: page 2 failed'],
      finalHeadSha: HEAD_SHA,
      headShas: [HEAD_SHA],
      jobs: [],
      workflowRuns: [],
    });
    const observation = buildPullRequestObservation({
      checkRuns: [CHECK_RUN],
      files: ['apps/app/src/page.tsx'],
      pullRequest: PULL_REQUEST,
      repository: 'genfeedai/genfeed.ai',
      supersededValidation,
      workflowRuns: [WORKFLOW_RUN],
    });
    const report = buildPullRequestValidationReport({
      limit: null,
      mode: 'explicit',
      observations: [observation],
      pullRequests: [PULL_REQUEST.number],
      repository: 'genfeedai/genfeed.ai',
    });

    expect(supersededValidation.summary.discardedRunnerTimeMs).toBeNull();
    expect(
      report.summary.supersededValidation.discardedRunnerTimeMs,
    ).toBeNull();
  });

  it('scopes same-SHA workflow runs to the observed pull request', () => {
    expect(
      isWorkflowRunAssociatedWithPullRequest(
        { ...WORKFLOW_RUN, pull_requests: [{ number: 999 }] },
        PULL_REQUEST,
      ),
    ).toBe(false);
    expect(
      isWorkflowRunAssociatedWithPullRequest(
        { ...WORKFLOW_RUN, pull_requests: [] },
        PULL_REQUEST,
      ),
    ).toBe(true);
    expect(
      isWorkflowRunAssociatedWithPullRequest(
        { ...WORKFLOW_RUN, head_branch: 'another-branch', pull_requests: [] },
        PULL_REQUEST,
      ),
    ).toBe(false);
  });

  it('bounds concurrent GitHub work while preserving input order', async () => {
    let active = 0;
    let maximumActive = 0;
    const results = await mapWithConcurrency(
      Array.from({ length: 24 }, (_, index) => index),
      4,
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return value * 2;
      },
    );

    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(results).toEqual(
      Array.from({ length: 24 }, (_, index) => index * 2),
    );
  });

  it('flags GitHub commit-history cap as incomplete evidence', () => {
    expect(pullRequestCommitCapReason(249)).toBeNull();
    expect(pullRequestCommitCapReason(250)).toContain('250-commit');
  });

  it('classifies changed-file surfaces without inventing coverage', () => {
    expect(classifyPullRequestSurface(['apps/app/src/page.tsx'])).toBe('app');
    expect(classifyPullRequestSurface(['apps/server/api/src/main.ts'])).toBe(
      'api',
    );
    expect(classifyPullRequestSurface(['apps/desktop/src/main.ts'])).toBe(
      'desktop',
    );
    expect(classifyPullRequestSurface(['packages/core/src/index.ts'])).toBe(
      'package',
    );
    expect(classifyPullRequestSurface(['docs/ci.md'])).toBe('documentation');
    expect(
      classifyPullRequestSurface([
        'apps/app/src/page.tsx',
        'packages/core/src/index.ts',
      ]),
    ).toBe('mixed');
  });

  it('follows every pagination link and retains partial evidence on failure', async () => {
    const pages = new Map([
      [
        '/first',
        {
          data: [{ id: 1 }],
          link: '<https://api.github.com/second>; rel="next", <https://api.github.com/last>; rel="last"',
        },
      ],
      ['https://api.github.com/second', { data: [{ id: 2 }], link: null }],
    ]);
    const complete = await collectPaginated(
      '/first',
      async (url) => {
        const page = pages.get(url);
        if (page === undefined) throw new Error(`Missing fixture ${url}`);
        return page;
      },
      (data) => data as Array<{ id: number }>,
    );
    const incomplete = await collectPaginated(
      '/first',
      async (url) => {
        if (url !== '/first') throw new Error('page 2 failed');
        const page = pages.get('/first');
        if (page === undefined) throw new Error('Missing first-page fixture');
        return page;
      },
      (data) => data as Array<{ id: number }>,
    );

    expect(complete).toMatchObject({
      complete: true,
      items: [{ id: 1 }, { id: 2 }],
      pages: 2,
    });
    expect(incomplete).toMatchObject({
      complete: false,
      error: 'page 2 failed',
      items: [{ id: 1 }],
      pages: 1,
    });

    const truncated = await collectPaginated(
      '/only',
      async () => ({
        data: { items: [{ id: 1 }], total_count: 2 },
        link: null,
      }),
      (data) => (data as { items: Array<{ id: number }> }).items,
      (data) => (data as { total_count: number }).total_count,
    );
    expect(truncated).toMatchObject({
      complete: false,
      error: 'Pagination returned 1 of 2 items',
      items: [{ id: 1 }],
      pages: 1,
    });
  });

  it('expands the merged-date window and orders the bounded sample by merge time', async () => {
    const requestedUrls: string[] = [];
    const searchUrl = await findMergedPullRequestSearchWindow(
      {
        async loadPage(url) {
          requestedUrls.push(url);
          const cutoff = new URL(url, 'https://api.github.com').searchParams
            .get('q')
            ?.match(/merged:>=(\d{4}-\d{2}-\d{2})/)?.[1];
          return {
            data: {
              incomplete_results: false,
              total_count: cutoff === '2026-07-20' ? 10 : 25,
            },
            link: null,
          };
        },
      },
      'genfeedai/genfeed.ai',
      20,
      new Date('2026-07-21T12:00:00.000Z'),
    );

    expect(requestedUrls).toHaveLength(2);
    expect(decodeURIComponent(searchUrl)).toContain('merged:>=2026-07-19');
    expect(
      selectRecentMergedPullRequestNumbers(
        [
          { number: 1, pull_request: { merged_at: '2026-07-20T10:00:00Z' } },
          { number: 3, pull_request: { merged_at: '2026-07-21T10:00:00Z' } },
          { number: 2, pull_request: { merged_at: '2026-07-21T10:00:00Z' } },
        ],
        2,
      ),
    ).toEqual([3, 2]);
  });

  it('fails closed when a single-day merged search exceeds GitHub retrieval limits', async () => {
    await expect(
      findMergedPullRequestSearchWindow(
        {
          async loadPage() {
            return {
              data: { incomplete_results: false, total_count: 1_001 },
              link: null,
            };
          },
        },
        'genfeedai/genfeed.ai',
        20,
        new Date('2026-07-21T12:00:00.000Z'),
      ),
    ).rejects.toThrow('No merged-date window contains 20-1000 pull requests');
  });

  it('renders deterministic JSON-contract data and concise Markdown', () => {
    const report = buildPullRequestValidationReport({
      collectedAt: '2026-07-20T12:00:00.000Z',
      limit: 20,
      mode: 'recent-merged',
      observations: [buildObservation()],
      pullRequests: [123],
      repository: 'genfeedai/genfeed.ai',
    });
    const markdown = formatPullRequestValidationMarkdown(report);

    expect(report.version).toBe('1.1');
    expect(report.summary).toMatchObject({
      byDisposition: { failed: 0, incomplete: 0, ready: 1 },
      pullRequests: 1,
      supersededValidation: {
        cancelledSafe: 0,
        cancelledUnresolved: 0,
        discardedRunnerTimeMs: 0,
        pullRequests: 0,
        runs: 0,
      },
    });
    expect(markdown).toContain('| [#123](');
    expect(markdown).toContain('30s');
    expect(markdown).toContain('Estimated discarded runner time: 0s');
    expect(markdown).toContain('Ready means the collected final-head evidence');
  });

  it('requires a minimum recent sample of twenty pull requests', () => {
    expect(
      parseCliOptions([
        '--repository',
        'genfeedai/genfeed.ai',
        '--limit',
        '20',
      ]),
    ).toMatchObject({ limit: 20, repository: 'genfeedai/genfeed.ai' });
    expect(() =>
      parseCliOptions([
        '--repository',
        'genfeedai/genfeed.ai',
        '--limit',
        '19',
      ]),
    ).toThrow('--limit must be between 20 and 100');
  });

  it('keeps the manual workflow read-only and artifact-backed', () => {
    const workflowPath = fileURLToPath(
      new URL(
        '../../.github/workflows/pr-validation-telemetry.yml',
        import.meta.url,
      ),
    );
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n/m);
    expect(workflow).toMatch(/^ {8}default: '20'$/m);
    expect(workflow).toMatch(/^permissions:\n(?: {2}[\w-]+: read\n)+$/m);
    expect(workflow).not.toMatch(/^\s*[\w-]+: write$/m);
    expect(workflow).toContain('actions/upload-artifact@v7');
    expect(workflow).toContain('report.json');
    expect(workflow).toContain('report.md');
    expect(workflow).toMatch(
      /group: pr-validation-telemetry-\$\{\{ github\.ref \}\}/,
    );
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).not.toContain('pulls/issues');
  });
});
