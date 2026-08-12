const DEPLOY_RUN_TITLE = 'Deploy ECS (production)';

export const DAILY_DEPLOY_FAILURE_LABEL = 'daily-deploy';

const ACTIVE_RUN_STATUSES = new Set([
  'in_progress',
  'pending',
  'queued',
  'requested',
  'waiting',
]);

const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);

const FAILURE_RESULTS = new Set(['cancelled', 'failure', 'timed_out']);
const OUTCOMES = new Set(['blocked', 'clean no-op', 'deployed', 'failed']);

const STAGE_ORDER = new Map([
  ['preflight', 0],
  ['dispatch-discovery', 1],
  ['full-suite-gate', 2],
  ['image-availability', 3],
  ['migration-deploy', 4],
  ['vercel', 5],
  ['post-deploy-smoke', 6],
  ['nested-cancellation', 7],
  ['unknown', 8],
]);

const STAGE_LABELS = {
  'dispatch-discovery': 'dispatch discovery',
  'full-suite-gate': 'full-suite/CI gate',
  'image-availability': 'image availability',
  'migration-deploy': 'migration/deploy',
  'nested-cancellation': 'nested workflow cancellation',
  'post-deploy-smoke': 'post-deploy smoke',
  preflight: 'preflight',
  unknown: 'unknown deploy stage',
  vercel: 'Vercel deploy',
};

const IMAGE_STEP_PATTERN =
  /(?:resolve available server image|copy server:.*ghcr.*ecr|login to ecr.*ghcr)/iu;
const MIGRATION_DEPLOY_STEP_PATTERN =
  /(?:resolve image tag|configure aws credentials|tofu|task definition|snapshot rds|migration|backfill|boot smoke|services stable|roll services|credential-encryption)/iu;

function normalize(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function singleLine(value, fallback) {
  return normalize(value).replaceAll(/\s+/gu, ' ') || fallback;
}

function timestamp(value, invalidValue = Number.MIN_SAFE_INTEGER) {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? invalidValue : parsed;
}

function newestRun(runs) {
  return [...(runs ?? [])].sort(
    (left, right) =>
      timestamp(right.created_at) - timestamp(left.created_at) ||
      Number(right.id ?? Number.MIN_SAFE_INTEGER) -
        Number(left.id ?? Number.MIN_SAFE_INTEGER),
  )[0];
}

function latestRunForSha(runs, sha, conclusion) {
  return newestRun(
    (runs ?? []).filter(
      (run) =>
        run.head_sha === sha &&
        (conclusion === undefined || run.conclusion === conclusion),
    ),
  );
}

function createPreflightResult(masterSha) {
  return {
    should_deploy: 'false',
    issue_needed: 'false',
    outcome: 'blocked',
    skipped_reason: '',
    failure_reason: '',
    failure_stage: '',
    master_sha: normalize(masterSha),
    ci_run_url: '',
    gate_run_url: '',
    deploy_marker_url: '',
    deployed_sha: '',
  };
}

/**
 * Deterministically decide whether one master SHA needs the normal production
 * deploy path. API collection stays in the workflow; this function owns every
 * ordering and outcome decision so fixtures exercise the production contract.
 */
export function evaluateDeployPreflight({
  shouldContinue,
  precheckSkippedReason,
  masterSha,
  workflowRef,
  workflowSha,
  currentRunId,
  activeWorkflowRuns = [],
  successfulWorkflowMarkers = [],
  ciRuns = [],
  fullSuiteRuns = [],
}) {
  const result = createPreflightResult(masterSha);

  function skip(reason, outcome = 'blocked') {
    result.outcome = outcome;
    result.skipped_reason = singleLine(
      reason,
      'Daily deploy preflight skipped.',
    );
    return result;
  }

  function block(reason) {
    result.outcome = 'blocked';
    result.issue_needed = 'true';
    result.failure_reason = singleLine(
      reason,
      'Daily deploy preflight failed.',
    );
    result.failure_stage = 'preflight';
    return result;
  }

  if (!shouldContinue) {
    return skip(
      precheckSkippedReason || 'Daily production deploy precheck skipped.',
      'clean no-op',
    );
  }

  if (!normalize(masterSha)) {
    return block('Could not resolve origin/master.');
  }

  if (workflowRef !== 'refs/heads/master') {
    return skip(
      `Workflow ref is ${workflowRef}; production deploy attempts only run from refs/heads/master.`,
    );
  }

  if (workflowSha !== masterSha) {
    return skip(
      `Workflow SHA ${workflowSha} does not match origin/master ${masterSha}; refusing to deploy a non-master SHA.`,
    );
  }

  for (const inventory of activeWorkflowRuns) {
    const active = newestRun(
      (inventory.runs ?? []).filter(
        (run) =>
          ACTIVE_RUN_STATUSES.has(run.status) &&
          String(run.id) !== String(currentRunId),
      ),
    );
    if (active) {
      return skip(
        `${inventory.label} is already ${active.status}: ${active.html_url}`,
      );
    }
  }

  for (const inventory of successfulWorkflowMarkers) {
    const successfulRun = latestRunForSha(inventory.runs, masterSha, 'success');
    if (successfulRun) {
      result.deploy_marker_url = successfulRun.html_url;
      result.deployed_sha = masterSha;
      return skip(
        `Current master SHA is already shipped by ${inventory.label}: ${successfulRun.html_url}`,
        'clean no-op',
      );
    }
  }

  const ciRun = latestRunForSha(ciRuns, masterSha);
  if (!ciRun) {
    return block(`No CI run found for exact master SHA ${masterSha}.`);
  }
  result.ci_run_url = ciRun.html_url;
  if (ciRun.status !== 'completed') {
    return skip(`CI for ${masterSha} is ${ciRun.status}: ${ciRun.html_url}`);
  }
  if (ciRun.conclusion !== 'success') {
    return block(
      `CI for ${masterSha} concluded ${ciRun.conclusion}: ${ciRun.html_url}`,
    );
  }

  const fullSuiteRun = latestRunForSha(fullSuiteRuns, masterSha);
  if (fullSuiteRun) {
    result.gate_run_url = fullSuiteRun.html_url;
    if (fullSuiteRun.status !== 'completed') {
      return skip(
        `Full Suite for ${masterSha} is ${fullSuiteRun.status}: ${fullSuiteRun.html_url}`,
      );
    }
    if (fullSuiteRun.conclusion !== 'success') {
      return block(
        `Full Suite for ${masterSha} concluded ${fullSuiteRun.conclusion}: ${fullSuiteRun.html_url}`,
      );
    }
  } else {
    result.gate_run_url =
      'Will run inside Deploy ECS (production) via qa-before-deploy.';
  }

  result.should_deploy = 'true';
  result.outcome = '';
  return result;
}

export function createDeployRunTitle(correlationId) {
  const normalizedCorrelationId = normalize(correlationId);
  return normalizedCorrelationId
    ? `${DEPLOY_RUN_TITLE} · daily:${normalizedCorrelationId}`
    : DEPLOY_RUN_TITLE;
}

export function matchesCorrelatedDeployRun(run, { correlationId }) {
  const normalizedCorrelationId = normalize(correlationId);
  if (!normalizedCorrelationId) {
    return false;
  }

  const title = normalize(run?.display_title || run?.name);
  const correlationMarker = `daily:${normalizedCorrelationId}`;
  const markerIndex = title.indexOf(correlationMarker);
  const markerEnd = markerIndex + correlationMarker.length;
  const markerPrefix =
    markerIndex > 0 ? title.slice(markerIndex - 1, markerIndex) : '';
  const markerSuffix =
    markerIndex >= 0 ? title.slice(markerEnd, markerEnd + 1) : '';
  const isDelimited =
    markerIndex >= 0 &&
    (markerIndex === 0 || /[\s()[\]{}·|/:;,]/u.test(markerPrefix)) &&
    (markerSuffix === '' || /[\s()[\]{}·|/:;,]/u.test(markerSuffix));

  return run?.event === 'workflow_dispatch' && isDelimited;
}

/**
 * A unique per-attempt correlation id is the identity. The expected SHA is
 * validated after discovery so a master update cannot make the orchestrator
 * lose its own child run and misdiagnose the race as a missing dispatch.
 */
export function selectCorrelatedDeployRun(runs, { correlationId }) {
  const matches = (runs ?? [])
    .filter((run) => matchesCorrelatedDeployRun(run, { correlationId }))
    .sort(
      (left, right) =>
        timestamp(left.created_at) - timestamp(right.created_at) ||
        Number(left.id ?? Number.MAX_SAFE_INTEGER) -
          Number(right.id ?? Number.MAX_SAFE_INTEGER),
    );

  return {
    matchCount: matches.length,
    run: matches.length === 1 ? matches[0] : null,
  };
}

function failedStep(job) {
  return (job.steps ?? []).find((step) =>
    FAILURE_CONCLUSIONS.has(step.conclusion),
  );
}

function classifyJob(job) {
  const step = failedStep(job);
  const jobName = normalize(job.name);
  const stepName = normalize(step?.name);
  const evidence = `${jobName}\n${stepName}`;

  if (/cancel doomed run/iu.test(jobName)) {
    return 'nested-cancellation';
  }
  if (/qa before deploy/iu.test(jobName)) {
    return 'full-suite-gate';
  }
  if (IMAGE_STEP_PATTERN.test(evidence)) {
    return 'image-availability';
  }
  if (/deploy vercel frontends/iu.test(jobName)) {
    return 'vercel';
  }
  if (/post-deploy smoke/iu.test(jobName)) {
    return 'post-deploy-smoke';
  }
  if (
    /deploy ecs/iu.test(jobName) ||
    MIGRATION_DEPLOY_STEP_PATTERN.test(evidence)
  ) {
    return 'migration-deploy';
  }
  if (job.conclusion === 'cancelled') {
    return 'nested-cancellation';
  }
  return 'unknown';
}

export function classifyDeployRunFailure(jobs, { childConclusion = '' } = {}) {
  const candidates = (jobs ?? [])
    .filter((job) => FAILURE_CONCLUSIONS.has(job.conclusion))
    .map((job) => ({
      job,
      stage: classifyJob(job),
      step: failedStep(job),
    }));

  const nonCancellationFailures = candidates.filter(
    (candidate) => candidate.job.conclusion !== 'cancelled',
  );
  const onlyCancellationEvidence =
    nonCancellationFailures.length === 0 &&
    (candidates.length > 0 || normalize(childConclusion) === 'cancelled');
  const pool = nonCancellationFailures.length
    ? nonCancellationFailures
    : candidates;

  pool.sort(
    (left, right) =>
      (STAGE_ORDER.get(left.stage) ?? STAGE_ORDER.get('unknown')) -
        (STAGE_ORDER.get(right.stage) ?? STAGE_ORDER.get('unknown')) ||
      timestamp(left.job.completed_at, Number.MAX_SAFE_INTEGER) -
        timestamp(right.job.completed_at, Number.MAX_SAFE_INTEGER) ||
      Number(left.job.id ?? Number.MAX_SAFE_INTEGER) -
        Number(right.job.id ?? Number.MAX_SAFE_INTEGER),
  );

  const selected = onlyCancellationEvidence
    ? candidates.find(
        (candidate) => candidate.stage === 'nested-cancellation',
      ) || pool[0]
    : pool[0];
  if (!selected) {
    return {
      jobConclusion: '',
      jobName: '',
      jobUrl: '',
      stage: onlyCancellationEvidence ? 'nested-cancellation' : 'unknown',
      stepName: '',
    };
  }

  return {
    jobConclusion: normalize(selected.job.conclusion),
    jobName: normalize(selected.job.name),
    jobUrl: normalize(selected.job.html_url),
    stage: onlyCancellationEvidence ? 'nested-cancellation' : selected.stage,
    stepName: normalize(selected.step?.name),
  };
}

export function formatDeployFailure(classification, conclusion) {
  const stageLabel = STAGE_LABELS[classification.stage] ?? STAGE_LABELS.unknown;
  const evidence = [classification.jobName, classification.stepName]
    .filter(Boolean)
    .join(' / ');
  const url = classification.jobUrl ? `: ${classification.jobUrl}` : '';

  const jobConclusion = classification.jobConclusion || 'failed';
  const childConclusion = normalize(conclusion) || 'unknown';

  return `${stageLabel} ${jobConclusion}${
    evidence ? ` at ${evidence}` : ''
  }${url}; child run concluded ${childConclusion}`;
}

export function resolveDailyDeployOutcome({
  preflightOutcome,
  dispatchOutcome,
  preflightResult,
  dispatchResult,
}) {
  if (OUTCOMES.has(dispatchOutcome)) {
    return dispatchOutcome;
  }
  if (OUTCOMES.has(preflightOutcome)) {
    return preflightOutcome;
  }
  if (
    FAILURE_RESULTS.has(preflightResult) ||
    FAILURE_RESULTS.has(dispatchResult)
  ) {
    return 'failed';
  }
  if (dispatchResult === 'success') {
    return 'deployed';
  }
  return 'blocked';
}

export function buildDailyDeploySummary(input) {
  const outcome = resolveDailyDeployOutcome(input);
  const gateRunUrl =
    input.gateRunUrl ===
      'Will run inside Deploy ECS (production) via qa-before-deploy.' &&
    normalize(input.deployRunUrl)
      ? `${input.deployRunUrl} (qa-before-deploy in normal deploy run)`
      : singleLine(input.gateRunUrl, 'not available');

  return [
    '## Daily production deploy',
    '',
    `- Outcome: \`${outcome}\``,
    `- Master SHA: \`${singleLine(input.masterSha, 'unknown')}\``,
    `- Deployed SHA: \`${singleLine(input.deployedSha, 'not deployed')}\``,
    `- Correlated child run: ${singleLine(input.deployRunUrl, 'not dispatched')}`,
    `- Skipped reason: ${singleLine(input.skippedReason, 'none')}`,
    `- Failure reason: ${singleLine(input.failureReason, 'none')}`,
    `- Failure stage: \`${singleLine(input.failureStage, 'none')}\``,
    `- Failure job: ${singleLine(input.failureJobName, 'not available')}`,
    `- Failure step: ${singleLine(input.failureStepName, 'not available')}`,
    `- Failure job URL: ${singleLine(input.failureJobUrl, 'not available')}`,
    `- CI run URL: ${singleLine(input.ciRunUrl, 'not available')}`,
    `- Gate run URL: ${gateRunUrl}`,
    `- Latest deploy marker: ${singleLine(input.deployMarkerUrl, 'not available')}`,
    `- Tracking issue: ${singleLine(input.issueUrl, 'none')}`,
    '',
    `Results: preflight=\`${singleLine(input.preflightResult, 'unknown')}\`, dispatch=\`${singleLine(input.dispatchResult, 'unknown')}\`, report=\`${singleLine(input.reportResult, 'unknown')}\`.`,
  ].join('\n');
}

export function createFailureReportMarker(runId) {
  return `<!-- daily-deploy-report:${normalize(runId) || 'unknown'} -->`;
}

export function buildDailyDeployFailureBody(input) {
  return [
    createFailureReportMarker(input.runId),
    `**Daily production deploy attempt blocked or failed** on \`${singleLine(input.date, 'unknown date')}\`.`,
    '',
    `- Attempt run: ${singleLine(input.runUrl, 'not available')}`,
    `- Master SHA: \`${singleLine(input.masterSha, 'unknown')}\``,
    `- Outcome: \`${singleLine(input.outcome, 'failed')}\``,
    `- Reason: ${singleLine(input.failureReason, 'Unknown failure.')}`,
    `- Failure stage: \`${singleLine(input.failureStage, 'unknown')}\``,
    `- Failure job: ${singleLine(input.failureJobName, 'not available')}`,
    `- Failure step: ${singleLine(input.failureStepName, 'not available')}`,
    `- Failure job URL: ${singleLine(input.failureJobUrl, 'not available')}`,
    `- CI run: ${singleLine(input.ciRunUrl, 'not available')}`,
    `- Full-suite gate: ${singleLine(input.gateRunUrl, 'not available')}`,
    `- Correlated child run: ${singleLine(input.deployRunUrl, 'not dispatched')}`,
    '',
    'The scheduler did not use fastlane. Any live migrations, if reached, ran only inside the normal `Deploy ECS (production)` workflow.',
  ].join('\n');
}

async function ensureDailyDeployLabel(github, { owner, repo }) {
  try {
    await github.rest.issues.getLabel({
      owner,
      repo,
      name: DAILY_DEPLOY_FAILURE_LABEL,
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: DAILY_DEPLOY_FAILURE_LABEL,
      color: 'b60205',
      description: 'Daily production deploy automation blockers',
    });
  }
}

/** Report one issue event per top-level scheduled run, including across reruns. */
export async function reportDailyDeployFailure({
  github,
  owner,
  repo,
  runId,
  body,
  core = console,
}) {
  await ensureDailyDeployLabel(github, { owner, repo });
  const marker = createFailureReportMarker(runId);
  const trackers = (
    await github.paginate(github.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'all',
      labels: DAILY_DEPLOY_FAILURE_LABEL,
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    })
  ).filter((issue) => !issue.pull_request);

  for (const tracker of trackers) {
    if (normalize(tracker.body).includes(marker)) {
      core.info?.(
        `Daily deploy run ${runId} was already reported in issue #${tracker.number}`,
      );
      return {
        action: 'noop',
        issueNumber: tracker.number,
        issueUrl: tracker.html_url,
      };
    }

    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: tracker.number,
      per_page: 100,
    });
    if (comments.some((comment) => normalize(comment.body).includes(marker))) {
      core.info?.(
        `Daily deploy run ${runId} was already reported in issue #${tracker.number}`,
      );
      return {
        action: 'noop',
        issueNumber: tracker.number,
        issueUrl: tracker.html_url,
      };
    }
  }

  const openTrackers = trackers.filter((tracker) => tracker.state !== 'closed');
  if (openTrackers.length > 0) {
    const tracker = openTrackers[0];
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: tracker.number,
      body,
    });
    core.info?.(`Commented on existing daily deploy issue #${tracker.number}`);
    return {
      action: 'commented',
      issueNumber: tracker.number,
      issueUrl: tracker.html_url,
    };
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: 'Daily production deploy blocked',
    body,
    labels: [DAILY_DEPLOY_FAILURE_LABEL],
  });
  core.info?.(`Created daily deploy issue #${created.data.number}`);
  return {
    action: 'created',
    issueNumber: created.data.number,
    issueUrl: created.data.html_url,
  };
}
