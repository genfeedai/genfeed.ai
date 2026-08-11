import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildDailyDeployFailureBody,
  buildDailyDeploySummary,
  classifyDeployRunFailure,
  createDeployRunTitle,
  evaluateDeployPreflight,
  formatDeployFailure,
  matchesCorrelatedDeployRun,
  reportDailyDeployFailure,
  resolveDailyDeployOutcome,
  selectCorrelatedDeployRun,
} from './daily-deploy-orchestration.mjs';

const MASTER_SHA = '018f97c16dca71292860159f0c92bdd684c5740c';
const CORRELATION_ID = '29672457857-1';

function workflowRun(overrides = {}) {
  return {
    conclusion: 'success',
    created_at: '2026-07-17T03:00:00Z',
    event: 'workflow_dispatch',
    head_sha: MASTER_SHA,
    html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/1',
    id: 1,
    status: 'completed',
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    completed_at: '2026-07-19T04:00:00Z',
    conclusion: 'failure',
    html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/1/job/1',
    id: 1,
    name: 'Unknown job',
    steps: [],
    ...overrides,
  };
}

function preflight(overrides = {}) {
  return evaluateDeployPreflight({
    shouldContinue: true,
    masterSha: MASTER_SHA,
    workflowRef: 'refs/heads/master',
    workflowSha: MASTER_SHA,
    currentRunId: 500,
    activeWorkflowRuns: [],
    successfulWorkflowMarkers: [],
    ciRuns: [workflowRun()],
    fullSuiteRuns: [],
    ...overrides,
  });
}

test('selects the normal deploy path only after exact-SHA CI preflight', () => {
  assert.deepEqual(preflight(), {
    should_deploy: 'true',
    issue_needed: 'false',
    outcome: '',
    skipped_reason: '',
    failure_reason: '',
    failure_stage: '',
    master_sha: MASTER_SHA,
    ci_run_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/1',
    gate_run_url:
      'Will run inside Deploy ECS (production) via qa-before-deploy.',
    deploy_marker_url: '',
    deployed_sha: '',
  });
});

test('preflight is a clean no-op when the exact master SHA already shipped', () => {
  const marker = workflowRun({
    html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/2',
    id: 2,
  });
  const result = preflight({
    successfulWorkflowMarkers: [
      { label: 'the canonical Release workflow', runs: [marker] },
    ],
  });

  assert.equal(result.should_deploy, 'false');
  assert.equal(result.issue_needed, 'false');
  assert.equal(result.outcome, 'clean no-op');
  assert.equal(result.deployed_sha, MASTER_SHA);
  assert.equal(result.deploy_marker_url, marker.html_url);
  assert.match(result.skipped_reason, /already shipped/);
});

test('preflight blocks active deploys and the newest failed CI run', () => {
  const active = preflight({
    activeWorkflowRuns: [
      {
        label: 'Deploy ECS (production)',
        runs: [workflowRun({ id: 12, status: 'in_progress' })],
      },
    ],
  });
  assert.equal(active.outcome, 'blocked');
  assert.equal(active.issue_needed, 'false');
  assert.match(active.skipped_reason, /already in_progress/);

  const failed = preflight({
    ciRuns: [
      workflowRun({ created_at: '2026-07-17T02:00:00Z' }),
      workflowRun({
        conclusion: 'failure',
        created_at: '2026-07-17T04:00:00Z',
        html_url: 'https://github.com/genfeedai/genfeed.ai/actions/runs/3',
        id: 3,
      }),
    ],
  });
  assert.equal(failed.should_deploy, 'false');
  assert.equal(failed.issue_needed, 'true');
  assert.equal(failed.failure_stage, 'preflight');
  assert.match(failed.failure_reason, /concluded failure/);
});

test('disabled preflight is a clean no-op without querying deploy evidence', () => {
  const result = preflight({
    shouldContinue: false,
    precheckSkippedReason: 'DAILY_PRODUCTION_DEPLOY_ENABLED is not true.',
    masterSha: '',
    ciRuns: [],
  });
  assert.equal(result.outcome, 'clean no-op');
  assert.equal(result.should_deploy, 'false');
  assert.equal(result.issue_needed, 'false');
});

test('correlates by the unique own-run marker before validating the SHA', () => {
  const run = {
    display_title: createDeployRunTitle(CORRELATION_ID),
    event: 'workflow_dispatch',
    head_sha: 'master-advanced-after-preflight',
    id: 42,
  };

  assert.equal(
    matchesCorrelatedDeployRun(run, { correlationId: CORRELATION_ID }),
    true,
  );
  assert.equal(
    matchesCorrelatedDeployRun(run, {
      correlationId: 'unrelated-run',
    }),
    false,
  );
  assert.equal(
    matchesCorrelatedDeployRun(
      { ...run, event: 'push' },
      { correlationId: CORRELATION_ID },
    ),
    false,
  );
  assert.equal(
    matchesCorrelatedDeployRun(
      {
        display_title: `Deploy ECS (production) · daily:${CORRELATION_ID} (extra)`,
        event: 'workflow_dispatch',
        head_sha: MASTER_SHA,
      },
      { correlationId: CORRELATION_ID },
    ),
    true,
  );
  assert.equal(
    matchesCorrelatedDeployRun(
      {
        display_title: `Deploy ECS (production) · daily:${CORRELATION_ID}0`,
        event: 'workflow_dispatch',
        head_sha: MASTER_SHA,
      },
      { correlationId: CORRELATION_ID },
    ),
    false,
  );

  const selection = selectCorrelatedDeployRun(
    [{ ...run, id: 41, display_title: createDeployRunTitle('unrelated') }, run],
    { correlationId: CORRELATION_ID },
  );
  assert.equal(selection.matchCount, 1);
  assert.equal(selection.run.id, 42);
  assert.notEqual(selection.run.head_sha, MASTER_SHA);
});

test('refuses ambiguous correlation instead of attaching an arbitrary child', () => {
  const correlated = workflowRun({
    display_title: createDeployRunTitle(CORRELATION_ID),
  });
  const selection = selectCorrelatedDeployRun(
    [correlated, { ...correlated, id: 2 }],
    { correlationId: CORRELATION_ID },
  );
  assert.equal(selection.matchCount, 2);
  assert.equal(selection.run, null);
});

test('classifies the observed masked API shard failure before fail-fast cancellation', () => {
  const classification = classifyDeployRunFailure([
    job({
      completed_at: '2026-07-19T03:59:54Z',
      html_url:
        'https://github.com/genfeedai/genfeed.ai/actions/runs/29672468247/job/88153881344',
      id: 88153881344,
      name: 'QA before deploy / CI Gate / Test API (Shard 1/4)',
      steps: [
        {
          conclusion: 'failure',
          name: 'Run API test shard',
        },
      ],
    }),
    job({
      completed_at: '2026-07-19T04:01:05Z',
      conclusion: 'cancelled',
      id: 88154323791,
      name: 'QA before deploy / Cancel doomed run',
    }),
  ]);

  assert.deepEqual(classification, {
    jobConclusion: 'failure',
    jobName: 'QA before deploy / CI Gate / Test API (Shard 1/4)',
    jobUrl:
      'https://github.com/genfeedai/genfeed.ai/actions/runs/29672468247/job/88153881344',
    stage: 'full-suite-gate',
    stepName: 'Run API test shard',
  });
  assert.match(
    formatDeployFailure(classification, 'cancelled'),
    /full-suite\/CI gate failure at .*Run API test shard.*child run concluded cancelled/,
  );
});

test('classifies image, deploy, Vercel, smoke, cancellation, and unknown stages', () => {
  const cases = [
    [
      job({
        name: 'Deploy / Deploy ECS',
        steps: [
          { conclusion: 'failure', name: 'Resolve available server image' },
        ],
      }),
      'image-availability',
    ],
    [
      job({
        name: 'Deploy / Deploy ECS',
        steps: [{ conclusion: 'failure', name: 'Run DB migrations' }],
      }),
      'migration-deploy',
    ],
    [job({ name: 'Deploy / Deploy Vercel frontends' }), 'vercel'],
    [job({ name: 'Deploy / Post-deploy smoke' }), 'post-deploy-smoke'],
    [
      job({
        conclusion: 'cancelled',
        name: 'QA before deploy / Cancel doomed run',
      }),
      'nested-cancellation',
    ],
    [job(), 'unknown'],
  ];

  for (const [fixture, expectedStage] of cases) {
    assert.equal(classifyDeployRunFailure([fixture]).stage, expectedStage);
  }
});

test('classifies every 2026-07-09 through 2026-07-16 scheduled failure from live job evidence', () => {
  const historical = [
    [
      '2026-07-09',
      28993544009,
      'QA before deploy / E2E Suite / Frontend E2E (Shard 4/4)',
      'Run core E2E shard 4/4',
      'failure',
      'full-suite-gate',
    ],
    [
      '2026-07-10',
      29068584464,
      'QA before deploy / E2E Suite / Frontend E2E (Shard 4/4)',
      'Run core E2E shard 4/4',
      'failure',
      'full-suite-gate',
    ],
    [
      '2026-07-11',
      29138434060,
      'QA before deploy / Build & Boot Check / Build & Boot Check',
      'Build unified server image (no push)',
      'failure',
      'full-suite-gate',
    ],
    [
      '2026-07-12',
      29178973769,
      'QA before deploy / Build & Boot Check / Build & Boot Check',
      'Build unified server image (no push)',
      'failure',
      'full-suite-gate',
    ],
    [
      '2026-07-13',
      29222869720,
      'QA before deploy / Build & Boot Check / Build & Boot Check',
      'Build unified server image (no push)',
      'failure',
      'full-suite-gate',
    ],
    [
      '2026-07-15',
      29386828585,
      'QA before deploy / Cancel doomed run',
      '',
      'cancelled',
      'nested-cancellation',
    ],
    [
      '2026-07-16',
      29469371464,
      'Deploy / Deploy ECS',
      'Wait for services stable',
      'failure',
      'migration-deploy',
    ],
  ];

  for (const [
    date,
    runId,
    jobName,
    stepName,
    conclusion,
    stage,
  ] of historical) {
    const classification = classifyDeployRunFailure(
      [
        job({
          conclusion,
          html_url: `https://github.com/genfeedai/genfeed.ai/actions/runs/${runId}/job/1`,
          name: jobName,
          steps: stepName ? [{ conclusion, name: stepName }] : [],
        }),
      ],
      { childConclusion: conclusion },
    );
    assert.equal(classification.stage, stage, date);
  }

  const july14 = preflight({
    masterSha: 'f9c1b5c623c64988b46a63d4828a0974bdef3bb8',
    workflowSha: 'f9c1b5c623c64988b46a63d4828a0974bdef3bb8',
    ciRuns: [
      workflowRun({
        conclusion: 'failure',
        head_sha: 'f9c1b5c623c64988b46a63d4828a0974bdef3bb8',
        html_url:
          'https://github.com/genfeedai/genfeed.ai/actions/runs/29267050207',
      }),
    ],
  });
  assert.equal(july14.failure_stage, 'preflight');
});

test('fails closed when terminal child job evidence is unavailable', () => {
  assert.deepEqual(classifyDeployRunFailure([]), {
    jobConclusion: '',
    jobName: '',
    jobUrl: '',
    stage: 'unknown',
    stepName: '',
  });
});

test('resolves and summarizes every public daily-deploy outcome', () => {
  const cases = [
    [{ dispatchOutcome: 'deployed' }, 'deployed'],
    [{ preflightOutcome: 'clean no-op' }, 'clean no-op'],
    [{ preflightOutcome: 'blocked' }, 'blocked'],
    [{ dispatchResult: 'failure' }, 'failed'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(resolveDailyDeployOutcome(input), expected);
  }

  const summary = buildDailyDeploySummary({
    dispatchOutcome: 'failed',
    masterSha: MASTER_SHA,
    deployRunUrl:
      'https://github.com/genfeedai/genfeed.ai/actions/runs/29469371464',
    failureStage: 'migration-deploy',
    preflightResult: 'success',
    dispatchResult: 'failure',
    reportResult: 'success',
  });
  assert.match(summary, /Outcome: `failed`/);
  assert.match(summary, new RegExp(MASTER_SHA));
  assert.match(summary, /Correlated child run: https:\/\/github\.com/);
  assert.match(summary, /Failure stage: `migration-deploy`/);
});

function createReporterFixture() {
  const issues = [
    {
      body: 'Existing tracker',
      html_url: 'https://github.com/genfeedai/genfeed.ai/issues/1813',
      number: 1813,
    },
  ];
  const comments = [];
  const listForRepo = async () => ({ data: issues });
  const listComments = async () => ({ data: comments });
  const github = {
    paginate: async (endpoint) => {
      if (endpoint === listForRepo) return issues;
      if (endpoint === listComments) return comments;
      throw new Error('Unexpected paginated endpoint');
    },
    rest: {
      issues: {
        create: async () => {
          throw new Error('Existing tracker must be reused');
        },
        createComment: async (input) => {
          comments.push({ body: input.body });
          return { data: {} };
        },
        createLabel: async () => ({ data: {} }),
        getLabel: async () => ({ data: {} }),
        listComments,
        listForRepo,
      },
    },
  };
  return { comments, github };
}

test('reports each scheduled failure exactly once across workflow reruns', async () => {
  const { comments, github } = createReporterFixture();
  const body = buildDailyDeployFailureBody({
    runId: 29469357749,
    date: '2026-07-16',
    runUrl: 'https://github.com/genfeedai/genfeed.ai/actions/runs/29469357749',
    masterSha: MASTER_SHA,
    outcome: 'failed',
    failureStage: 'migration-deploy',
    deployRunUrl:
      'https://github.com/genfeedai/genfeed.ai/actions/runs/29469371464',
  });
  const first = await reportDailyDeployFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    runId: 29469357749,
    body,
    core: { info: () => {} },
  });
  const rerun = await reportDailyDeployFailure({
    github,
    owner: 'genfeedai',
    repo: 'genfeed.ai',
    runId: 29469357749,
    body,
    core: { info: () => {} },
  });

  assert.equal(first.action, 'commented');
  assert.equal(rerun.action, 'noop');
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /daily-deploy-report:29469357749/);
  assert.match(comments[0].body, /Correlated child run:/);
});

test('keeps the daily and deploy workflow correlation contract wired', () => {
  const dailyWorkflow = readFileSync(
    fileURLToPath(
      new URL(
        '../../.github/workflows/daily-production-deploy.yml',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const deployWorkflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/deploy-ecs.yml', import.meta.url),
    ),
    'utf8',
  );
  const fullSuiteWorkflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/full-suite.yml', import.meta.url),
    ),
    'utf8',
  );
  const deployCoreWorkflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/_deploy-ecs-core.yml', import.meta.url),
    ),
    'utf8',
  );
  const ciWorkflow = readFileSync(
    fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
    'utf8',
  );

  assert.match(deployWorkflow, /^run-name: .*orchestrator_run_id/m);
  assert.match(
    deployWorkflow,
    /format\('Deploy ECS \(production\) · daily:\{0\}', inputs\.orchestrator_run_id\)/,
  );
  assert.match(deployWorkflow, /^ {6}orchestrator_run_id:/m);
  assert.match(deployWorkflow, /^ {6}expected_master_sha:/m);
  assert.match(deployWorkflow, /EXPECTED_MASTER_SHA/);
  assert.match(dailyWorkflow, /daily-deploy-orchestration\.mjs/);
  assert.match(
    dailyWorkflow,
    /name: Checkout workflow helpers[\s\S]*?persist-credentials: false/,
  );
  assert.match(dailyWorkflow, /selectCorrelatedDeployRun/);
  assert.match(dailyWorkflow, /orchestrator_run_id: correlationId/);
  assert.match(dailyWorkflow, /expected_master_sha: masterSha/);
  assert.match(dailyWorkflow, /listJobsForWorkflowRun/);
  assert.match(dailyWorkflow, /filter: 'latest'/);
  assert.match(dailyWorkflow, /evaluateDeployPreflight/);
  assert.match(dailyWorkflow, /reportDailyDeployFailure/);
  assert.match(dailyWorkflow, /buildDailyDeploySummary/);
  assert.match(dailyWorkflow, /failure_stage/);
  assert.match(dailyWorkflow, /Correlated child run/);

  for (const [name, workflow] of [
    ['daily deploy', dailyWorkflow],
    ['normal deploy', deployWorkflow],
    ['nested full suite', fullSuiteWorkflow],
  ]) {
    assert.match(
      workflow,
      /^ {2}cancel-in-progress: false$/m,
      `${name} must queue instead of cancelling required production QA`,
    );
  }

  assert.match(deployWorkflow, /GITHUB_REF.*refs\/heads\/master/);
  assert.match(
    deployWorkflow,
    /uses: \.\/\.github\/workflows\/full-suite\.yml/,
  );
  assert.match(
    deployWorkflow,
    /uses: \.\/\.github\/workflows\/_deploy-ecs-core\.yml/,
  );
  assert.match(
    deployCoreWorkflow,
    /Snapshot RDS before migrations \(fail-closed\)/,
  );
  assert.match(deployCoreWorkflow, /Run DB migrations/);
  assert.match(deployCoreWorkflow, /Deploy Vercel frontends/);
  assert.match(deployCoreWorkflow, /Post-deploy smoke/);
  assert.match(
    deployCoreWorkflow,
    /group: deploy-ecs-roll\n {6}cancel-in-progress: false/,
  );
  assert.match(
    ciWorkflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    'nested CI may cancel obsolete PR checks, never release/deploy QA',
  );

  const dispatchJob = dailyWorkflow.match(
    /\n {2}dispatch-deploy:[\s\S]*?(?=\n {2}report-failure:)/,
  )?.[0];
  assert.ok(dispatchJob);
  assert.match(dispatchJob, /workflowId = process\.env\.DEPLOY_WORKFLOW/);
  assert.doesNotMatch(dispatchJob, /FASTLANE_WORKFLOW|deploy-ecs-fastlane/);
});

test('keeps one canonical release contract for community and SaaS', () => {
  const releaseWorkflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/release.yml', import.meta.url),
    ),
    'utf8',
  );
  const publishSelfhostedWorkflow = readFileSync(
    fileURLToPath(
      new URL(
        '../../.github/workflows/_publish-selfhosted-core.yml',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const dockerWorkflow = readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/docker-publish.yml', import.meta.url),
    ),
    'utf8',
  );
  const dailyWorkflow = readFileSync(
    fileURLToPath(
      new URL(
        '../../.github/workflows/daily-production-deploy.yml',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const orchestrationHelper = readFileSync(
    fileURLToPath(new URL('./daily-deploy-orchestration.mjs', import.meta.url)),
    'utf8',
  );

  assert.match(releaseWorkflow, /^name: Release$/m);
  assert.match(releaseWorkflow, /^ {2}workflow_dispatch:/m);
  assert.match(
    releaseWorkflow,
    /uses: \.\/\.github\/workflows\/full-suite\.yml/,
  );
  assert.match(
    releaseWorkflow,
    /uses: \.\/\.github\/workflows\/_publish-selfhosted-core\.yml/,
  );
  assert.match(
    releaseWorkflow,
    /uses: \.\/\.github\/workflows\/_deploy-ecs-core\.yml/,
  );
  const releaseDeploySaas = releaseWorkflow.match(
    /deploy-saas:[\s\S]*?(?=\n {2}promote-community:)/,
  )?.[0];
  assert.ok(releaseDeploySaas);
  assert.doesNotMatch(releaseDeploySaas, /image_tag:/);
  assert.match(releaseDeploySaas, /allow_rollback: false/);
  assert.match(
    releaseWorkflow,
    /promote-community:[\s\S]*?needs: \[validate-release, publish-community, deploy-saas\]/,
  );
  // npm is the release's one irreversible lane: it runs only after community and
  // SaaS are green, and the GitHub release cannot leave draft without it.
  assert.match(
    releaseWorkflow,
    /publish-packages:[\s\S]*?needs: \[validate-release, publish-community, deploy-saas\][\s\S]*?id-token: write[\s\S]*?uses: \.\/\.github\/workflows\/publish-packages\.yml[\s\S]*?dry_run: false/,
  );
  const releasePublishRelease = releaseWorkflow.match(
    /\n {2}publish-release:[\s\S]*$/,
  )?.[0];
  assert.ok(releasePublishRelease);
  for (const dependency of [
    'validate-release',
    'publish-community',
    'deploy-saas',
    'promote-community',
    'publish-packages',
  ]) {
    assert.match(
      releasePublishRelease,
      new RegExp(`^ {6}- ${dependency}$`, 'm'),
    );
  }
  assert.match(
    releaseWorkflow,
    /gh release edit "\$\{RELEASE_TAG\}" --draft=false/,
  );
  assert.match(
    publishSelfhostedWorkflow,
    /name: Attach install bundle to draft GitHub release[\s\S]*?draft: true/,
  );

  assert.doesNotMatch(dockerWorkflow, /^ {2}release:/m);
  assert.doesNotMatch(dailyWorkflow, /getLatestRelease/);
  assert.doesNotMatch(dailyWorkflow, /listDeployments/);
  assert.match(dailyWorkflow, /RELEASE_WORKFLOW: release\.yml/);
  assert.match(dailyWorkflow, /the canonical Release workflow/);
  assert.match(
    orchestrationHelper,
    /Current master SHA is already shipped by \$\{label\}/,
  );
});
