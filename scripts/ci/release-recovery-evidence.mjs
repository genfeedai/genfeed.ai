import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const INSTALL_ASSET_NAMES = new Set([
  'genfeed-selfhosted.tar.gz',
  'genfeed-selfhosted.tar.gz.sha256',
]);
const ARTIFACT_JOB_NAME =
  'Publish Community / Publish & Smoke Public Install Artifact';
const ATTACH_STEP_NAME = 'Attach install bundle to draft GitHub release';

const REQUIRED_FULL_SUITE_JOBS = [
  'Full Suite / CI Gate / Trust Check',
  'Full Suite / CI Gate / Executable Contracts',
  'Full Suite / CI Gate / Secretlint (changed files)',
  'Full Suite / CI Gate / Format',
  'Full Suite / CI Gate / Lint',
  'Full Suite / CI Gate / Gitleaks',
  'Full Suite / CI Gate / Test Plan',
  'Full Suite / CI Gate / Typecheck',
  'Full Suite / CI Gate / Spec Typecheck',
  'Full Suite / CI Gate / Test Web and Mobile',
  'Full Suite / CI Gate / Test Packages',
  'Full Suite / CI Gate / Test Server Services',
  'Full Suite / CI Gate / OpenAPI Spec Drift',
  'Full Suite / CI Gate / Test API (Shard 1/4)',
  'Full Suite / CI Gate / Test API (Shard 2/4)',
  'Full Suite / CI Gate / Test API (Shard 3/4)',
  'Full Suite / CI Gate / Test API (Shard 4/4)',
  'Full Suite / CI Gate / Test App (Shard 1/4)',
  'Full Suite / CI Gate / Test App (Shard 2/4)',
  'Full Suite / CI Gate / Test App (Shard 3/4)',
  'Full Suite / CI Gate / Test App (Shard 4/4)',
  'Full Suite / CI Gate / Build',
  'Full Suite / E2E Suite / Frontend Authed E2E (real Better Auth)',
  'Full Suite / E2E Suite / E2E Route Reference Inventory',
  'Full Suite / E2E Suite / API E2E Tests',
  'Full Suite / E2E Suite / Frontend E2E (Shard 1/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 2/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 3/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 4/4)',
  'Full Suite / E2E Suite / E2E Gate (all shards)',
  'Full Suite / E2E Suite / Merge E2E Reports',
  'Full Suite / Build & Boot Check / Build & Boot Check',
  'Full Suite / Build & Boot Check / Server Bundle Boot Check',
];

const PUBLIC_SAAS_JOBS = [
  'Deploy hosted SaaS / Validate public source',
  'Deploy hosted SaaS / Deploy hosted SaaS / Deploy ECS',
  'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy web',
  'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy app',
  'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy docs',
  'Deploy hosted SaaS / Deploy hosted SaaS / Post-deploy smoke',
];

const REQUIRED_SUCCESSFUL_ARTIFACT_STEPS = [
  'Set up job',
  'Checkout release source',
  'Setup create package',
  'Test and build create package',
  'Build version-pinned release bundle',
  'Smoke create against the release bundle',
  'Anonymous exact-image pull and metadata check',
  'Post Setup create package',
  'Post Checkout release source',
  'Complete job',
];

function fail(message) {
  throw new Error(message);
}

function requireValue(actual, expected, label, runId) {
  if (String(actual ?? '') !== String(expected)) {
    fail(
      `Recovery run ${runId} has ${label}=${actual ?? '<empty>'}, expected ${expected}.`,
    );
  }
}

function requireUniqueJob(jobs, name, expectedConclusion, releaseSha) {
  // Recovery reads historical runs as well as runs using the current display name.
  const names =
    name === 'Full Suite / E2E Suite / E2E Route Reference Inventory'
      ? [name, 'Full Suite / E2E Suite / E2E Route Coverage Gate']
      : [name];
  const matches = jobs.filter((job) => names.includes(job.name));
  if (matches.length !== 1) {
    fail(
      `Recovery evidence requires exactly one ${name} job; found ${matches.length}.`,
    );
  }

  const [job] = matches;
  if (job.status !== 'completed') {
    fail(`Recovery evidence job ${name} is not completed.`);
  }
  if (job.head_sha !== releaseSha) {
    fail(
      `Recovery evidence job ${name} ran at ${job.head_sha ?? '<empty>'}, not ${releaseSha}.`,
    );
  }
  if (job.conclusion !== expectedConclusion) {
    fail(
      `Recovery evidence job ${name} concluded ${job.conclusion ?? '<empty>'}, expected ${expectedConclusion}.`,
    );
  }
  return job;
}

function requireUniqueStep(steps, name, expectedConclusion) {
  const matches = steps.filter((step) => step.name === name);
  if (matches.length !== 1) {
    fail(
      `Recovery artifact evidence requires exactly one ${name} step; found ${matches.length}.`,
    );
  }
  const [step] = matches;
  if (step.status !== 'completed' || step.conclusion !== expectedConclusion) {
    fail(
      `Recovery artifact step ${name} concluded ${step.conclusion ?? '<empty>'}, expected ${expectedConclusion}.`,
    );
  }
}

function validateArtifactFailureBoundary(artifactJob) {
  const steps = Array.isArray(artifactJob.steps) ? artifactJob.steps : [];
  for (const stepName of REQUIRED_SUCCESSFUL_ARTIFACT_STEPS) {
    requireUniqueStep(steps, stepName, 'success');
  }
  requireUniqueStep(steps, ATTACH_STEP_NAME, 'failure');

  const unexpectedFailures = steps.filter(
    (step) =>
      step.name !== ATTACH_STEP_NAME &&
      (step.status !== 'completed' || step.conclusion !== 'success'),
  );
  if (unexpectedFailures.length > 0) {
    fail(
      `Only ${ATTACH_STEP_NAME} may fail during recovery; unexpected step failures: ${unexpectedFailures
        .map((step) => step.name)
        .join(', ')}.`,
    );
  }
}

function requireHistoricalDraft(releases, requestedTag, releaseSha) {
  const matches = releases.filter(
    (release) => release.tag_name === requestedTag,
  );
  if (matches.length !== 1) {
    fail(
      `Recovery requires exactly one GitHub release draft for ${requestedTag}; found ${matches.length}.`,
    );
  }
  const [release] = matches;
  if (release.draft !== true || release.published_at != null) {
    fail(`Recovery requires ${requestedTag} to remain an unpublished draft.`);
  }
  if (release.target_commitish !== releaseSha) {
    fail(
      `Recovery draft ${requestedTag} targets ${release.target_commitish ?? '<empty>'}, not historical run SHA ${releaseSha}.`,
    );
  }
  if (release.name !== requestedTag) {
    fail(
      `Recovery draft ${requestedTag} has title ${release.name ?? '<empty>'}, expected ${requestedTag}.`,
    );
  }
  if (!Number.isSafeInteger(release.id) || release.id <= 0) {
    fail('Recovery draft has an invalid release ID.');
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.some((asset) => INSTALL_ASSET_NAMES.has(asset.name))) {
    fail(
      `Recovery draft ${requestedTag} must not already contain versioned install assets.`,
    );
  }

  const changelogs = assets.filter((asset) => asset.name === 'CHANGELOG.md');
  if (changelogs.length !== 1) {
    fail(
      'Recovery requires exactly one non-empty, uploaded CHANGELOG.md asset with a sha256 digest.',
    );
  }

  const [changelog] = changelogs;
  if (
    changelog.state !== 'uploaded' ||
    !Number.isSafeInteger(changelog.id) ||
    changelog.id <= 0 ||
    !Number.isSafeInteger(changelog.size) ||
    changelog.size <= 0 ||
    !DIGEST_PATTERN.test(changelog.digest ?? '')
  ) {
    fail(
      'Recovery requires exactly one non-empty, uploaded CHANGELOG.md asset with a sha256 digest.',
    );
  }
  return {
    changelogAssetDigest: changelog.digest,
    changelogAssetId: String(changelog.id),
    changelogAssetSize: String(changelog.size),
    draftBodySha256: createHash('sha256')
      .update(String(release.body ?? ''))
      .digest('hex'),
    draftId: String(release.id),
    draftTitle: release.name,
  };
}

export function validateReleaseRecoveryEvidence({
  jobs,
  releases,
  requestedRepository,
  requestedRunId,
  requestedSaasLane,
  requestedTag,
  run,
}) {
  if (!/^[1-9][0-9]*$/.test(requestedRunId ?? '')) {
    fail('recovery_run_id must be a positive numeric GitHub Actions run ID.');
  }
  if (!Array.isArray(jobs) || !Array.isArray(releases) || !run) {
    fail('Recovery evidence payload is incomplete.');
  }

  requireValue(
    run.repository?.full_name,
    requestedRepository,
    'repository',
    requestedRunId,
  );
  requireValue(
    run.head_repository?.full_name,
    requestedRepository,
    'head repository',
    requestedRunId,
  );
  requireValue(run.id, requestedRunId, 'run ID', requestedRunId);
  requireValue(
    run.path,
    '.github/workflows/release.yml',
    'workflow path',
    requestedRunId,
  );
  requireValue(run.event, 'workflow_dispatch', 'event', requestedRunId);
  requireValue(
    run.display_title,
    `Release ${requestedTag}`,
    'display title',
    requestedRunId,
  );
  requireValue(run.head_branch, 'master', 'head branch', requestedRunId);
  requireValue(run.status, 'completed', 'status', requestedRunId);
  requireValue(run.conclusion, 'failure', 'conclusion', requestedRunId);

  const releaseSha = run.head_sha ?? '';
  if (!SHA_PATTERN.test(releaseSha)) {
    fail(
      `Recovery run ${requestedRunId} does not expose an exact lowercase source SHA.`,
    );
  }

  const suiteJobs = jobs.filter((job) =>
    String(job.name ?? '').startsWith('Full Suite /'),
  );
  if (suiteJobs.length === 0) {
    fail('Recovery run contains no Full Suite job evidence.');
  }
  const invalidSuiteJobs = suiteJobs.filter(
    (job) =>
      job.status !== 'completed' ||
      job.head_sha !== releaseSha ||
      !['success', 'skipped'].includes(job.conclusion),
  );
  if (invalidSuiteJobs.length > 0) {
    fail(
      `Recovery run has ${invalidSuiteJobs.length} incomplete, failed, or wrong-SHA Full Suite jobs.`,
    );
  }
  for (const jobName of REQUIRED_FULL_SUITE_JOBS) {
    requireUniqueJob(jobs, jobName, 'success', releaseSha);
  }

  if (requestedSaasLane === 'monorepo') {
    for (const jobName of PUBLIC_SAAS_JOBS) {
      requireUniqueJob(jobs, jobName, 'success', releaseSha);
    }
    requireUniqueJob(
      jobs,
      'Deploy hosted SaaS through private operations',
      'skipped',
      releaseSha,
    );
  } else if (requestedSaasLane === 'operations') {
    requireUniqueJob(jobs, 'Deploy hosted SaaS', 'skipped', releaseSha);
    requireUniqueJob(
      jobs,
      'Deploy hosted SaaS through private operations',
      'success',
      releaseSha,
    );
  } else {
    fail(`Unsupported SaaS lane ${requestedSaasLane}.`);
  }

  requireUniqueJob(
    jobs,
    'Validate release and create draft',
    'success',
    releaseSha,
  );
  requireUniqueJob(
    jobs,
    'Publish Community / Self-Hosted Build Verify / Build & Boot Check (Self-Hosted)',
    'success',
    releaseSha,
  );
  requireUniqueJob(
    jobs,
    'Publish Community / Build & Push Self-Hosted Image',
    'success',
    releaseSha,
  );
  const artifactJob = requireUniqueJob(
    jobs,
    ARTIFACT_JOB_NAME,
    'failure',
    releaseSha,
  );
  if (!Number.isSafeInteger(artifactJob.id) || artifactJob.id <= 0) {
    fail('Recovery artifact evidence has an invalid job ID.');
  }
  validateArtifactFailureBoundary(artifactJob);
  requireUniqueJob(jobs, 'Publish npm Packages', 'skipped', releaseSha);
  requireUniqueJob(
    jobs,
    'Promote Community release channels',
    'skipped',
    releaseSha,
  );
  requireUniqueJob(jobs, 'Publish GitHub release', 'skipped', releaseSha);

  return {
    artifactJobId: String(artifactJob.id),
    ...requireHistoricalDraft(releases, requestedTag, releaseSha),
    releaseSha,
  };
}

function runGhJson(args, { env, spawnSync }) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `GitHub recovery evidence lookup failed: ${String(result.stderr ?? '').trim() || 'unknown gh error'}`,
    );
  }
  return JSON.parse(result.stdout);
}

export function runReleaseRecoveryCli({
  appendFileSync,
  env = process.env,
  error = console.error,
  spawnSync,
} = {}) {
  try {
    const runId = env.RECOVERY_RUN_ID ?? '';
    const repository = env.GITHUB_REPOSITORY ?? '';
    const requestedSaasLane = env.REQUESTED_SAAS_LANE ?? '';
    const requestedTag = env.REQUESTED_TAG ?? '';
    if (!/^[1-9][0-9]*$/.test(runId)) {
      fail('recovery_run_id must be a positive numeric GitHub Actions run ID.');
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      fail('GITHUB_REPOSITORY must identify one owner/repository pair.');
    }
    if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(requestedTag)) {
      fail('Recovery requires an exact stable release tag.');
    }
    if (!['monorepo', 'operations'].includes(requestedSaasLane)) {
      fail(`Unsupported SaaS lane ${requestedSaasLane}.`);
    }
    const run = runGhJson(
      ['api', `repos/${repository}/actions/runs/${runId}`],
      { env, spawnSync },
    );
    const jobPages = runGhJson(
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
      ],
      { env, spawnSync },
    );
    const releasePages = runGhJson(
      [
        'api',
        '--paginate',
        '--slurp',
        `repos/${repository}/releases?per_page=100`,
      ],
      { env, spawnSync },
    );
    const evidence = validateReleaseRecoveryEvidence({
      jobs: jobPages.flatMap((page) => page.jobs ?? []),
      releases: releasePages.flat(),
      requestedRepository: repository,
      requestedRunId: runId,
      requestedSaasLane,
      requestedTag,
      run,
    });

    appendFileSync(
      env.GITHUB_OUTPUT,
      [
        `artifact_job_id=${evidence.artifactJobId}`,
        `changelog_asset_digest=${evidence.changelogAssetDigest}`,
        `changelog_asset_id=${evidence.changelogAssetId}`,
        `changelog_asset_size=${evidence.changelogAssetSize}`,
        `draft_body_sha256=${evidence.draftBodySha256}`,
        `draft_id=${evidence.draftId}`,
        `draft_title=${evidence.draftTitle}`,
        'recovery_mode=true',
        `recovery_run_id=${runId}`,
        'recovery_saas_verified=true',
        'recovery_suite_verified=true',
        `release_sha=${evidence.releaseSha}`,
        '',
      ].join('\n'),
    );

    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        [
          '## Partial release recovery evidence',
          '',
          `- Prior run: ${runId}`,
          `- Release: \`${requestedTag}\``,
          `- Pinned SHA: \`${evidence.releaseSha}\``,
          '- Full Suite: proved green from the prior run',
          `- Hosted SaaS (${requestedSaasLane}): proved green from the prior run`,
          '- Community image: prior build/push proved green; the exact image will be reused and reverified',
          '- Bundle build, smoke, and exact-image verification: proved green; only draft attachment failed',
          `- Failed attachment job: ${evidence.artifactJobId}`,
          '- Irreversible promotion, npm, and publication jobs: proved skipped',
          '- Existing install assets: none',
          `- Historical changelog asset: ${evidence.changelogAssetId} (${evidence.changelogAssetDigest})`,
          '',
        ].join('\n'),
      );
    }
    return evidence;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`::error::${message}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const { spawnSync } = await import('node:child_process');
  const { appendFileSync } = await import('node:fs');
  runReleaseRecoveryCli({ appendFileSync, spawnSync });
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
