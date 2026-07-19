const DEPLOY_RUN_TITLE = 'Deploy ECS (production)';

const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);

const STAGE_ORDER = new Map([
  ['full-suite-gate', 0],
  ['image-availability', 1],
  ['migration-deploy', 2],
  ['vercel', 3],
  ['post-deploy-smoke', 4],
  ['nested-cancellation', 5],
  ['unknown', 6],
]);

const STAGE_LABELS = {
  'full-suite-gate': 'full-suite/CI gate',
  'image-availability': 'image availability',
  'migration-deploy': 'migration/deploy',
  'nested-cancellation': 'nested workflow cancellation',
  'post-deploy-smoke': 'post-deploy smoke',
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

function conclusionOrder(conclusion) {
  return conclusion === 'cancelled' ? 1 : 0;
}

function timestamp(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function createDeployRunTitle(correlationId) {
  const normalizedCorrelationId = normalize(correlationId);
  return normalizedCorrelationId
    ? `${DEPLOY_RUN_TITLE} · daily:${normalizedCorrelationId}`
    : DEPLOY_RUN_TITLE;
}

export function matchesCorrelatedDeployRun(run, { correlationId, masterSha }) {
  return (
    run?.event === 'workflow_dispatch' &&
    run?.head_sha === masterSha &&
    run?.display_title === createDeployRunTitle(correlationId)
  );
}

export function classifyDeployRunFailure(jobs) {
  const candidates = (jobs ?? [])
    .filter((job) => FAILURE_CONCLUSIONS.has(job.conclusion))
    .map((job) => ({
      job,
      stage: classifyJob(job),
      step: failedStep(job),
    }))
    .sort(
      (left, right) =>
        conclusionOrder(left.job.conclusion) -
          conclusionOrder(right.job.conclusion) ||
        (STAGE_ORDER.get(left.stage) ?? STAGE_ORDER.get('unknown')) -
          (STAGE_ORDER.get(right.stage) ?? STAGE_ORDER.get('unknown')) ||
        timestamp(left.job.completed_at) - timestamp(right.job.completed_at) ||
        Number(left.job.id ?? Number.MAX_SAFE_INTEGER) -
          Number(right.job.id ?? Number.MAX_SAFE_INTEGER),
    );

  const selected = candidates[0];
  if (!selected) {
    return {
      jobConclusion: '',
      jobName: '',
      jobUrl: '',
      stage: 'unknown',
      stepName: '',
    };
  }

  return {
    jobConclusion: normalize(selected.job.conclusion),
    jobName: normalize(selected.job.name),
    jobUrl: normalize(selected.job.html_url),
    stage: selected.stage,
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
