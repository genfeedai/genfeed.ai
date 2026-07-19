import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyDeployRunFailure,
  createDeployRunTitle,
  formatDeployFailure,
  matchesCorrelatedDeployRun,
} from './daily-deploy-orchestration.mjs';

const MASTER_SHA = '018f97c16dca71292860159f0c92bdd684c5740c';
const CORRELATION_ID = '29672457857-1';

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

test('matches only the exact correlated workflow-dispatch run and master SHA', () => {
  const run = {
    display_title: createDeployRunTitle(CORRELATION_ID),
    event: 'workflow_dispatch',
    head_sha: MASTER_SHA,
  };

  assert.equal(
    matchesCorrelatedDeployRun(run, {
      correlationId: CORRELATION_ID,
      masterSha: MASTER_SHA,
    }),
    true,
  );
  assert.equal(
    matchesCorrelatedDeployRun(run, {
      correlationId: 'unrelated-run',
      masterSha: MASTER_SHA,
    }),
    false,
  );
  assert.equal(
    matchesCorrelatedDeployRun(run, {
      correlationId: CORRELATION_ID,
      masterSha: 'different-sha',
    }),
    false,
  );
  assert.equal(
    matchesCorrelatedDeployRun(
      { ...run, event: 'push' },
      { correlationId: CORRELATION_ID, masterSha: MASTER_SHA },
    ),
    false,
  );
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

test('fails closed when terminal child job evidence is unavailable', () => {
  assert.deepEqual(classifyDeployRunFailure([]), {
    jobConclusion: '',
    jobName: '',
    jobUrl: '',
    stage: 'unknown',
    stepName: '',
  });
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

  assert.match(deployWorkflow, /^run-name: .*orchestrator_run_id/m);
  assert.match(deployWorkflow, /^ {6}orchestrator_run_id:/m);
  assert.match(dailyWorkflow, /daily-deploy-orchestration\.mjs/);
  assert.match(dailyWorkflow, /matchesCorrelatedDeployRun/);
  assert.match(dailyWorkflow, /orchestrator_run_id: correlationId/);
  assert.match(dailyWorkflow, /listJobsForWorkflowRun/);
  assert.match(dailyWorkflow, /failure_stage/);
  assert.match(dailyWorkflow, /OUTCOME: .*'failed'/);
  assert.match(dailyWorkflow, /echo "- Outcome:/);
});
