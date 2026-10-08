import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BODY_SHA_PATTERN = /^[0-9a-f]{64}$/;
const POSITIVE_INT_PATTERN = /^[1-9][0-9]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const QUALIFICATION_TIMESTAMP_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escapes from GitHub job log text.
const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escapes from GitHub job log text.
const ANSI_OSC = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const QUALIFICATION_RECORD_KEYS = [
  'assets',
  'draftBodySha256',
  'draftId',
  'draftTitle',
  'imageDigest',
  'jobProfile',
  'releaseSha',
  'releaseTag',
  'repository',
  'runId',
];
const QUALIFICATION_ASSET_NAMES = [
  'CHANGELOG.md',
  'genfeed-selfhosted.tar.gz',
  'genfeed-selfhosted.tar.gz.sha256',
];
const QUALIFICATION_ASSET_KEYS = [
  'created_at',
  'digest',
  'id',
  'name',
  'size',
  'updated_at',
];
const INSTALL_ASSET_NAMES = new Set([
  'genfeed-selfhosted.tar.gz',
  'genfeed-selfhosted.tar.gz.sha256',
]);
const ARTIFACT_JOB_NAME =
  'Publish Community / Publish & Smoke Public Install Artifact';
const ATTACH_STEP_NAME = 'Attach install bundle to draft GitHub release';
const PARENT_NPM_JOB_NAME = 'Publish npm Packages';
const PROMOTE_JOB_NAME = 'Promote Community release channels';
const PUBLISH_RELEASE_JOB_NAME = 'Publish GitHub release';
const NPM_PLAN_JOB_NAME =
  'Publish npm Packages / Plan npm release from registry drift';
const NPM_PREFLIGHT_JOB_NAME =
  'Publish npm Packages / Preflight immutable package tarballs';
const NPM_PUBLISH_JOB_NAME =
  'Publish npm Packages / Publish preflighted package tarballs';
const NPM_PLAN_FAILURE_STEP = 'Validate pinned release source';
const RUNNER_EXIT_ANNOTATION = 'Process completed with exit code 1.';
const REFUSE_EXISTING_ASSETS_STEP =
  'Refuse pre-existing versioned install assets';
const VERIFY_ASSET_IDENTITIES_STEP =
  'Verify immutable install asset identities';

export const RECOVERY_KIND_ATTACHMENT_FAILURE = 'attachment-failure';
export const RECOVERY_KIND_NPM_SOURCE_NOOP = 'npm-source-noop';
export const NPM_MASTER_ADVANCED_ERROR =
  'Master advanced after this release was dispatched. Run a new release from current master.';

const INSTALL_ASSET_NAMES_LIST = [
  'genfeed-selfhosted.tar.gz',
  'genfeed-selfhosted.tar.gz.sha256',
];

export const NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS = [
  'Full Suite / Build & Boot Check / Build & Boot Check',
  'Full Suite / Build & Boot Check / Server Bundle Boot Check',
  'Full Suite / Build & Boot Check / Server Image / Build & Push Server Image',
  'Full Suite / Build & Boot Check / Server Image / Resolve server image inputs',
  'Full Suite / CI Gate / Build',
  'Full Suite / CI Gate / Plan',
  'Full Suite / CI Gate / Spec Typecheck (pool-1)',
  'Full Suite / CI Gate / Spec Typecheck (pool-2)',
  'Full Suite / CI Gate / Spec Typecheck (pool-3)',
  'Full Suite / CI Gate / Static Checks',
  'Full Suite / CI Gate / Test API (shard 1/4)',
  'Full Suite / CI Gate / Test API (shard 2/4)',
  'Full Suite / CI Gate / Test API (shard 3/4)',
  'Full Suite / CI Gate / Test API (shard 4/4)',
  'Full Suite / CI Gate / Test App (shard 1/4)',
  'Full Suite / CI Gate / Test App (shard 2/4)',
  'Full Suite / CI Gate / Test App (shard 3/4)',
  'Full Suite / CI Gate / Test App (shard 4/4)',
  'Full Suite / CI Gate / Test Workspaces (browser-extension)',
  'Full Suite / CI Gate / Test Workspaces (packages)',
  'Full Suite / CI Gate / Test Workspaces (server)',
  'Full Suite / CI Gate / Test Workspaces (web)',
  'Full Suite / Connected Visual Acceptance / Actual runsc rendering and isolation',
  'Full Suite / Connected Visual Acceptance / Connected runsc rendering and Library acceptance',
  'Full Suite / E2E Suite / API E2E Full',
  'Full Suite / E2E Suite / API E2E Full Gate',
  'Full Suite / E2E Suite / API E2E Tests',
  'Full Suite / E2E Suite / BRAND Receipt and Relocation Acceptance',
  'Full Suite / E2E Suite / E2E Gate (all shards)',
  'Full Suite / E2E Suite / E2E Route Reference Inventory',
  'Full Suite / E2E Suite / Frontend Authed E2E (real Better Auth)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 1/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 2/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 3/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 4/4)',
  'Full Suite / E2E Suite / Isolated Publish E2E',
  'Full Suite / E2E Suite / Merge E2E Reports',
  'Full Suite / E2E Suite / Proactive Production Turn Acceptance',
  'Full Suite / E2E Suite / Serial Runtime Acceptance',
  'Full Suite / Final Connected Acceptance',
  'Full Suite / Master SHA Verdict',
];

export const NPM_SOURCE_NOOP_REQUIRED_SKIPPED_JOBS = [
  'Deploy hosted SaaS / Deploy hosted SaaS / Report post-deploy smoke failure',
  'Full Suite / CI Gate / Master CI failure tracker',
  'Full Suite / CI Gate / Tests Gate',
  'Full Suite / E2E Suite / Record nightly E2E recovery',
  'Full Suite / E2E Suite / Report nightly E2E failure',
  NPM_PREFLIGHT_JOB_NAME,
  NPM_PUBLISH_JOB_NAME,
  PROMOTE_JOB_NAME,
  PUBLISH_RELEASE_JOB_NAME,
];

export const NPM_SOURCE_NOOP_CURRENT_FULL_SUITE_JOBS = [
  'Full Suite / Build & Boot Check / Build & Boot Check',
  'Full Suite / Build & Boot Check / Server Bundle Boot Check',
  'Full Suite / Build & Boot Check / Server Image / Build & Push Server Image',
  'Full Suite / Build & Boot Check / Server Image / Resolve server image inputs',
  'Full Suite / CI Gate / Build',
  'Full Suite / CI Gate / Cloud Tenant Guard Sweep',
  'Full Suite / CI Gate / Plan',
  'Full Suite / CI Gate / Spec Typecheck (pool-1)',
  'Full Suite / CI Gate / Spec Typecheck (pool-2)',
  'Full Suite / CI Gate / Spec Typecheck (pool-3)',
  'Full Suite / CI Gate / Static Checks',
  'Full Suite / CI Gate / Test API (shard 1/4)',
  'Full Suite / CI Gate / Test API (shard 2/4)',
  'Full Suite / CI Gate / Test API (shard 3/4)',
  'Full Suite / CI Gate / Test API (shard 4/4)',
  'Full Suite / CI Gate / Test App (shard 1/4)',
  'Full Suite / CI Gate / Test App (shard 2/4)',
  'Full Suite / CI Gate / Test App (shard 3/4)',
  'Full Suite / CI Gate / Test App (shard 4/4)',
  'Full Suite / CI Gate / Test Workspaces (browser-extension)',
  'Full Suite / CI Gate / Test Workspaces (packages-1/4)',
  'Full Suite / CI Gate / Test Workspaces (packages-2/4)',
  'Full Suite / CI Gate / Test Workspaces (packages-3/4)',
  'Full Suite / CI Gate / Test Workspaces (packages-4/4)',
  'Full Suite / CI Gate / Test Workspaces (server)',
  'Full Suite / CI Gate / Test Workspaces (web)',
  'Full Suite / Connected Visual Acceptance / Actual runsc rendering and isolation',
  'Full Suite / Connected Visual Acceptance / Connected runsc rendering and Library acceptance',
  'Full Suite / E2E Suite / API E2E Full',
  'Full Suite / E2E Suite / API E2E Full Gate',
  'Full Suite / E2E Suite / API E2E Tests',
  'Full Suite / E2E Suite / BRAND Receipt and Relocation Acceptance',
  'Full Suite / E2E Suite / E2E Gate (all shards)',
  'Full Suite / E2E Suite / E2E Route Reference Inventory',
  'Full Suite / E2E Suite / Frontend Authed E2E (real Better Auth)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 1/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 2/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 3/4)',
  'Full Suite / E2E Suite / Frontend E2E (Shard 4/4)',
  'Full Suite / E2E Suite / Isolated Publish E2E',
  'Full Suite / E2E Suite / Merge E2E Reports',
  'Full Suite / E2E Suite / Proactive Production Turn Acceptance',
  'Full Suite / E2E Suite / Serial Runtime Acceptance',
  'Full Suite / Final Connected Acceptance',
  'Full Suite / Master SHA Verdict',
];

const NPM_SOURCE_NOOP_JOB_PROFILES = Object.freeze({
  'ci-packages-single-v1': Object.freeze({
    fullSuiteJobs: Object.freeze([...NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS]),
    skippedJobs: Object.freeze([...NPM_SOURCE_NOOP_REQUIRED_SKIPPED_JOBS]),
  }),
  'ci-packages-sharded-v1': Object.freeze({
    fullSuiteJobs: Object.freeze([...NPM_SOURCE_NOOP_CURRENT_FULL_SUITE_JOBS]),
    skippedJobs: Object.freeze([
      ...NPM_SOURCE_NOOP_REQUIRED_SKIPPED_JOBS,
      `Full Suite / CI Gate / Setup Benchmark (\${{ matrix.mode }})`,
      'Verify recovered release assets',
    ]),
  }),
});

const NPM_PLAN_STEP_OUTCOMES = [
  ['Set up job', 'success'],
  ['Reject real publishes outside the release workflow', 'skipped'],
  ['Require a master ref', 'success'],
  ['Checkout the pinned commit', 'success'],
  [NPM_PLAN_FAILURE_STEP, 'failure'],
  ['Setup Bun environment', 'skipped'],
  ['Validate npm release enrollment', 'skipped'],
  ['Resolve packages to publish', 'skipped'],
  ['Checkout current release controller', 'skipped'],
  ['Require an empty npm plan for historical recovery', 'skipped'],
  ['Post Checkout the pinned commit', 'success'],
  ['Complete job', 'success'],
];

const NPM_ARTIFACT_STEP_OUTCOMES = [
  ['Set up job', 'success'],
  ['Checkout release source', 'success'],
  ['Setup create package', 'success'],
  ['Test and build create package', 'success'],
  ['Build version-pinned release bundle', 'success'],
  ['Smoke create against the release bundle', 'success'],
  ['Anonymous exact-image pull and metadata check', 'success'],
  [REFUSE_EXISTING_ASSETS_STEP, 'skipped'],
  [ATTACH_STEP_NAME, 'success'],
  [VERIFY_ASSET_IDENTITIES_STEP, 'success'],
  ['Post Setup create package', 'success'],
  ['Post Checkout release source', 'success'],
  ['Complete job', 'success'],
];

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

const NPM_SOURCE_NOOP_SAAS_JOBS = [
  ...PUBLIC_SAAS_JOBS,
  'Deploy hosted SaaS / Deploy hosted SaaS / Promote verified server image',
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

function requireExactStepOutcomes(steps, outcomes, label) {
  if (!Array.isArray(steps)) {
    fail(`${label} is missing step evidence.`);
  }
  const expected = new Map(outcomes);
  for (const [name, conclusion] of expected) {
    requireUniqueStep(steps, name, conclusion);
  }
  const unknown = steps.filter((step) => !expected.has(step.name));
  if (unknown.length > 0) {
    fail(
      `${label} has unexpected steps: ${unknown
        .map((step) => step.name)
        .join(', ')}.`,
    );
  }
}

function stripTerminalSequences(value) {
  return String(value ?? '')
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '');
}

function errorLines(log) {
  return stripTerminalSequences(log)
    .split(/\r?\n/)
    .filter((line) => line.includes('##[error]'));
}

export function validateNpmPlanSourceFailure({ annotations, log, steps }) {
  requireExactStepOutcomes(steps, NPM_PLAN_STEP_OUTCOMES, 'npm plan job');
  if (!Array.isArray(annotations)) {
    fail('npm plan annotations are missing.');
  }

  const failures = annotations.filter(
    (annotation) => annotation?.annotation_level === 'failure',
  );
  const masterAdvanced = failures.filter(
    (annotation) => annotation.message === NPM_MASTER_ADVANCED_ERROR,
  );
  if (masterAdvanced.length !== 1) {
    fail(
      `npm plan source validation must record exactly one master-advanced failure annotation; found ${masterAdvanced.length}.`,
    );
  }
  const otherFailures = failures.filter(
    (annotation) => annotation.message !== NPM_MASTER_ADVANCED_ERROR,
  );
  if (
    otherFailures.some(
      (annotation) => annotation.message !== RUNNER_EXIT_ANNOTATION,
    )
  ) {
    fail(
      `npm plan failed for a reason other than master advancing: ${otherFailures
        .map((annotation) => annotation.message ?? '<empty>')
        .join(' | ')}.`,
    );
  }
  if (
    otherFailures.filter(
      (annotation) => annotation.message === RUNNER_EXIT_ANNOTATION,
    ).length > 1
  ) {
    fail('npm plan job has duplicate runner failure annotations.');
  }

  if (typeof log !== 'string' || log.trim() === '') {
    fail('npm plan job log is missing.');
  }
  const loggedErrors = errorLines(log);
  const masterLogs = loggedErrors.filter((line) =>
    line.includes(`##[error]${NPM_MASTER_ADVANCED_ERROR}`),
  );
  if (masterLogs.length !== 1) {
    fail(
      `npm plan log must contain exactly one master-advanced error; found ${masterLogs.length}.`,
    );
  }
  const otherLogs = loggedErrors.filter(
    (line) => !line.includes(`##[error]${NPM_MASTER_ADVANCED_ERROR}`),
  );
  if (
    otherLogs.some(
      (line) => !line.includes(`##[error]${RUNNER_EXIT_ANNOTATION}`),
    )
  ) {
    fail('npm plan log records an error other than master advancing.');
  }
}

function emptyInstallAssets() {
  return {
    archiveAssetDigest: '',
    archiveAssetId: '',
    archiveAssetSize: '',
    checksumAssetDigest: '',
    checksumAssetId: '',
    checksumAssetSize: '',
    imageDigest: '',
  };
}

function qualificationKeys(value) {
  return Object.keys(value ?? {})
    .sort()
    .join();
}

function invalidQualification(detail) {
  fail(`Release recovery qualification table is invalid: ${detail}.`);
}

function validateQualificationAsset(asset, index) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    invalidQualification(`asset ${index} is not a record`);
  }
  if (
    qualificationKeys(asset) !== [...QUALIFICATION_ASSET_KEYS].sort().join()
  ) {
    invalidQualification(`asset ${index} has unexpected fields`);
  }
  if (!QUALIFICATION_ASSET_NAMES.includes(asset.name)) {
    invalidQualification(`asset ${index} has an unknown name`);
  }
  if (!Number.isSafeInteger(asset.id) || asset.id <= 0) {
    invalidQualification(`asset ${asset.name} has an invalid id`);
  }
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0) {
    invalidQualification(`asset ${asset.name} has an invalid size`);
  }
  if (!DIGEST_PATTERN.test(asset.digest)) {
    invalidQualification(`asset ${asset.name} has an invalid digest`);
  }
  if (
    !QUALIFICATION_TIMESTAMP_PATTERN.test(asset.created_at) ||
    !QUALIFICATION_TIMESTAMP_PATTERN.test(asset.updated_at)
  ) {
    invalidQualification(`asset ${asset.name} has an invalid timestamp`);
  }
}

function validateQualificationRecord(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    invalidQualification(`record ${index} is not an object`);
  }
  if (
    qualificationKeys(record) !== [...QUALIFICATION_RECORD_KEYS].sort().join()
  ) {
    invalidQualification(`record ${index} has unexpected fields`);
  }
  if (
    typeof record.jobProfile !== 'string' ||
    !Object.hasOwn(NPM_SOURCE_NOOP_JOB_PROFILES, record.jobProfile)
  ) {
    invalidQualification(`record ${index} has an unknown job profile`);
  }
  if (
    !REPOSITORY_PATTERN.test(record.repository) ||
    !POSITIVE_INT_PATTERN.test(record.runId) ||
    !TAG_PATTERN.test(record.releaseTag) ||
    !SHA_PATTERN.test(record.releaseSha) ||
    !POSITIVE_INT_PATTERN.test(record.draftId) ||
    record.draftTitle !== record.releaseTag ||
    !BODY_SHA_PATTERN.test(record.draftBodySha256) ||
    !DIGEST_PATTERN.test(record.imageDigest)
  ) {
    invalidQualification(`record ${index} has an invalid identity`);
  }
  if (
    !Array.isArray(record.assets) ||
    record.assets.length !== QUALIFICATION_ASSET_NAMES.length
  ) {
    invalidQualification(
      `record ${record.runId} must list the original assets`,
    );
  }
  record.assets.forEach((asset, assetIndex) => {
    validateQualificationAsset(asset, assetIndex);
  });
  const names = record.assets.map((asset) => asset.name);
  if (new Set(names).size !== names.length) {
    invalidQualification(`record ${record.runId} repeats an asset name`);
  }
  for (const name of QUALIFICATION_ASSET_NAMES) {
    if (!names.includes(name)) {
      invalidQualification(`record ${record.runId} is missing ${name}`);
    }
  }
}

export function loadReleaseRecoveryQualifications(
  table = JSON.parse(
    readFileSync(
      new URL('./release-recovery-qualifications.json', import.meta.url),
      'utf8',
    ),
  ),
) {
  if (
    !table ||
    typeof table !== 'object' ||
    Array.isArray(table) ||
    qualificationKeys(table) !== 'qualifications,version' ||
    table.version !== 2 ||
    !Array.isArray(table.qualifications) ||
    table.qualifications.length === 0
  ) {
    invalidQualification('version 2 qualifications are required');
  }
  const seen = new Set();
  table.qualifications.forEach((record, index) => {
    validateQualificationRecord(record, index);
    if (seen.has(record.runId)) {
      invalidQualification(`run ${record.runId} is duplicated`);
    }
    seen.add(record.runId);
  });
  return table.qualifications;
}

const RELEASE_RECOVERY_QUALIFICATIONS = loadReleaseRecoveryQualifications();

function qualificationIdentity(record) {
  const byName = new Map(record.assets.map((asset) => [asset.name, asset]));
  const changelog = byName.get('CHANGELOG.md');
  const archive = byName.get('genfeed-selfhosted.tar.gz');
  const checksum = byName.get('genfeed-selfhosted.tar.gz.sha256');
  return {
    archiveAssetDigest: archive.digest,
    archiveAssetId: String(archive.id),
    archiveAssetSize: String(archive.size),
    changelogAssetDigest: changelog.digest,
    changelogAssetId: String(changelog.id),
    changelogAssetSize: String(changelog.size),
    checksumAssetDigest: checksum.digest,
    checksumAssetId: String(checksum.id),
    checksumAssetSize: String(checksum.size),
    draftBodySha256: record.draftBodySha256,
    draftId: String(record.draftId),
    draftTitle: record.draftTitle,
    imageDigest: record.imageDigest,
    releaseSha: record.releaseSha,
  };
}

function reviewedQualificationForRun(requestedRunId) {
  const matches = RELEASE_RECOVERY_QUALIFICATIONS.filter(
    (record) => record.runId === requestedRunId,
  );
  if (matches.length !== 1) {
    fail(
      `npm-source-noop run ${requestedRunId} has no reviewed controller qualification.`,
    );
  }
  return matches[0];
}

function requireReviewedNpmSourceNoopQualification({
  release,
  releaseSha,
  requestedRepository,
  requestedRunId,
  requestedTag,
}) {
  const record = reviewedQualificationForRun(requestedRunId);
  const draft = draftIdentity(release);
  const drifted = [];
  if (record.repository !== requestedRepository) {
    drifted.push('repository');
  }
  if (record.releaseTag !== requestedTag) {
    drifted.push('release tag');
  }
  if (record.releaseSha !== releaseSha) {
    drifted.push('source SHA');
  }
  if (String(record.draftId) !== draft.draftId) {
    drifted.push('draft id');
  }
  if (record.draftTitle !== draft.draftTitle) {
    drifted.push('draft title');
  }
  if (record.draftBodySha256 !== draft.draftBodySha256) {
    drifted.push('draft body');
  }
  if (drifted.length > 0) {
    fail(
      `npm-source-noop ${drifted.join(', ')} does not match the reviewed controller qualification.`,
    );
  }

  const liveAssets = new Map(
    (Array.isArray(release.assets) ? release.assets : []).map((asset) => [
      asset?.name,
      asset,
    ]),
  );
  for (const qualified of record.assets) {
    const live = liveAssets.get(qualified.name);
    if (
      typeof live?.created_at !== 'string' ||
      typeof live?.updated_at !== 'string'
    ) {
      fail(
        `npm-source-noop asset ${qualified.name} is missing reviewed timestamps.`,
      );
    }
    const fields = [];
    if (String(live.id) !== String(qualified.id)) {
      fields.push('id');
    }
    if (String(live.size) !== String(qualified.size)) {
      fields.push('size');
    }
    if (live.digest !== qualified.digest) {
      fields.push('digest');
    }
    if (live.created_at !== qualified.created_at) {
      fields.push('created_at');
    }
    if (live.updated_at !== qualified.updated_at) {
      fields.push('updated_at');
    }
    if (fields.length > 0) {
      fail(
        `npm-source-noop asset ${qualified.name} does not match the reviewed controller qualification (${fields.join(', ')}).`,
      );
    }
  }
  return qualificationIdentity(record);
}

function requireContentAddressedAsset(asset, label) {
  if (
    asset?.state !== 'uploaded' ||
    !Number.isSafeInteger(asset?.id) ||
    asset.id <= 0 ||
    !Number.isSafeInteger(asset?.size) ||
    asset.size <= 0 ||
    !DIGEST_PATTERN.test(asset?.digest ?? '')
  ) {
    fail(
      `Recovery requires a non-empty, uploaded ${label} asset with a sha256 digest.`,
    );
  }
}

function assetIdentity(asset) {
  return {
    digest: asset.digest,
    id: String(asset.id),
    size: String(asset.size),
  };
}

function detectRecoveryKind(jobs) {
  const artifactJobs = jobs.filter((job) => job.name === ARTIFACT_JOB_NAME);
  if (artifactJobs.length !== 1) {
    fail(
      `Recovery evidence requires exactly one ${ARTIFACT_JOB_NAME} job; found ${artifactJobs.length}.`,
    );
  }
  const parentNpmJobs = jobs.filter((job) => job.name === PARENT_NPM_JOB_NAME);
  const planJobs = jobs.filter((job) => job.name === NPM_PLAN_JOB_NAME);
  const artifactFailed = artifactJobs[0].conclusion === 'failure';
  const artifactSucceeded = artifactJobs[0].conclusion === 'success';
  const attachmentShape =
    artifactFailed && parentNpmJobs.length === 1 && planJobs.length === 0;
  const npmSourceNoopShape =
    artifactSucceeded && parentNpmJobs.length === 0 && planJobs.length === 1;
  if (attachmentShape) {
    return RECOVERY_KIND_ATTACHMENT_FAILURE;
  }
  if (npmSourceNoopShape) {
    return RECOVERY_KIND_NPM_SOURCE_NOOP;
  }
  fail(
    'Recovery evidence does not match attachment-failure or npm-source-noop.',
  );
}

function requireNpmSourceNoopDraft(releases, requestedTag, releaseSha) {
  const release = requireOneDraft(releases, requestedTag, releaseSha);
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.length !== 3) {
    fail(
      'npm-source-noop draft must contain exactly the changelog and two install assets.',
    );
  }
  const byName = new Map();
  for (const asset of assets) {
    if (byName.has(asset.name)) {
      fail(
        `npm-source-noop draft contains a duplicate ${asset.name ?? '<empty>'} asset.`,
      );
    }
    byName.set(asset.name, asset);
  }
  for (const name of ['CHANGELOG.md', ...INSTALL_ASSET_NAMES_LIST]) {
    if (!byName.has(name)) {
      fail(
        'npm-source-noop draft must contain exactly the changelog and two install assets.',
      );
    }
    requireContentAddressedAsset(byName.get(name), name);
  }

  const changelog = assetIdentity(byName.get('CHANGELOG.md'));
  const archive = assetIdentity(byName.get('genfeed-selfhosted.tar.gz'));
  const checksum = assetIdentity(
    byName.get('genfeed-selfhosted.tar.gz.sha256'),
  );
  return {
    ...draftIdentity(release),
    archiveAssetDigest: archive.digest,
    archiveAssetId: archive.id,
    archiveAssetSize: archive.size,
    changelogAssetDigest: changelog.digest,
    changelogAssetId: changelog.id,
    changelogAssetSize: changelog.size,
    checksumAssetDigest: checksum.digest,
    checksumAssetId: checksum.id,
    checksumAssetSize: checksum.size,
  };
}

function validateAttachmentFailureEvidence({
  jobs,
  releases,
  requestedTag,
  releaseSha,
}) {
  for (const jobName of REQUIRED_FULL_SUITE_JOBS) {
    requireUniqueJob(jobs, jobName, 'success', releaseSha);
  }
  for (const jobName of PUBLIC_SAAS_JOBS) {
    requireUniqueJob(jobs, jobName, 'success', releaseSha);
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
  requireUniqueJob(jobs, PARENT_NPM_JOB_NAME, 'skipped', releaseSha);
  requireUniqueJob(jobs, PROMOTE_JOB_NAME, 'skipped', releaseSha);
  requireUniqueJob(jobs, PUBLISH_RELEASE_JOB_NAME, 'skipped', releaseSha);
  return {
    artifactJobId: String(artifactJob.id),
    ...emptyInstallAssets(),
    ...requireHistoricalDraft(releases, requestedTag, releaseSha),
    recoveryKind: RECOVERY_KIND_ATTACHMENT_FAILURE,
    releaseSha,
  };
}

function validateNpmSourceNoopEvidence({
  jobs,
  npmPlanEvidence,
  releases,
  requestedRepository,
  requestedRunId,
  requestedTag,
  releaseSha,
}) {
  const qualification = reviewedQualificationForRun(requestedRunId);
  const profile = NPM_SOURCE_NOOP_JOB_PROFILES[qualification.jobProfile];
  for (const jobName of profile.fullSuiteJobs) {
    requireUniqueJob(jobs, jobName, 'success', releaseSha);
  }
  for (const jobName of profile.skippedJobs) {
    requireUniqueJob(jobs, jobName, 'skipped', releaseSha);
  }
  for (const jobName of NPM_SOURCE_NOOP_SAAS_JOBS) {
    requireUniqueJob(jobs, jobName, 'success', releaseSha);
  }

  const failures = jobs.filter(
    (job) => job.conclusion !== 'success' && job.conclusion !== 'skipped',
  );
  if (failures.length !== 1 || failures[0].name !== NPM_PLAN_JOB_NAME) {
    fail(
      `npm-source-noop recovery allows only the npm plan source validation to fail; found ${
        failures
          .map((job) => `${job.name}=${job.conclusion ?? '<empty>'}`)
          .join(', ') || 'none'
      }.`,
    );
  }
  const wrongSha = jobs.filter((job) => job.head_sha !== releaseSha);
  if (wrongSha.length > 0) {
    fail(
      `npm-source-noop job ${wrongSha[0].name} ran at ${wrongSha[0].head_sha ?? '<empty>'}, not ${releaseSha}.`,
    );
  }
  const incomplete = jobs.filter((job) => job.status !== 'completed');
  if (incomplete.length > 0) {
    fail(`npm-source-noop job ${incomplete[0].name} is not completed.`);
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
    'success',
    releaseSha,
  );
  if (!Number.isSafeInteger(artifactJob.id) || artifactJob.id <= 0) {
    fail('Recovery artifact evidence has an invalid job ID.');
  }
  requireExactStepOutcomes(
    artifactJob.steps,
    NPM_ARTIFACT_STEP_OUTCOMES,
    'Community install artifact job',
  );

  const planJob = requireUniqueJob(
    jobs,
    NPM_PLAN_JOB_NAME,
    'failure',
    releaseSha,
  );
  if (!Number.isSafeInteger(planJob.id) || planJob.id <= 0) {
    fail('npm plan evidence has an invalid job ID.');
  }
  if (
    !npmPlanEvidence ||
    !Array.isArray(npmPlanEvidence.annotations) ||
    typeof npmPlanEvidence.log !== 'string'
  ) {
    fail(
      'npm-source-noop recovery requires npm plan annotations and the job log.',
    );
  }
  validateNpmPlanSourceFailure({
    annotations: npmPlanEvidence.annotations,
    log: npmPlanEvidence.log,
    steps: planJob.steps,
  });

  requireNpmSourceNoopDraft(releases, requestedTag, releaseSha);
  const qualified = requireReviewedNpmSourceNoopQualification({
    release: requireOneDraft(releases, requestedTag, releaseSha),
    releaseSha,
    requestedRepository,
    requestedRunId,
    requestedTag,
  });
  return {
    artifactJobId: String(artifactJob.id),
    ...qualified,
    recoveryKind: RECOVERY_KIND_NPM_SOURCE_NOOP,
    releaseSha: qualified.releaseSha,
  };
}

function requireOneDraft(releases, requestedTag, releaseSha) {
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
  return release;
}

function draftIdentity(release) {
  return {
    draftBodySha256: createHash('sha256')
      .update(String(release.body ?? ''))
      .digest('hex'),
    draftId: String(release.id),
    draftTitle: release.name,
  };
}

function requireHistoricalDraft(releases, requestedTag, releaseSha) {
  const release = requireOneDraft(releases, requestedTag, releaseSha);
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
    ...draftIdentity(release),
  };
}

function refuseExistingRemoteTag(remoteTagPresent, requestedTag) {
  if (remoteTagPresent === true) {
    fail(
      `Recovery refuses ${requestedTag} because its Git tag already exists.`,
    );
  }
}

export function validateReleaseRecoveryEvidence({
  jobs,
  npmPlanEvidence,
  releases,
  remoteTagPresent = false,
  requestedRepository,
  requestedRunId,
  requestedTag,
  run,
  sourceIsAncestor,
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
  if (sourceIsAncestor === false) {
    fail(
      `Historical release SHA ${releaseSha} is no longer reachable from master.`,
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

  const recoveryKind = detectRecoveryKind(jobs);
  const evidence =
    recoveryKind === RECOVERY_KIND_ATTACHMENT_FAILURE
      ? validateAttachmentFailureEvidence({
          jobs,
          releases,
          releaseSha,
          requestedTag,
        })
      : validateNpmSourceNoopEvidence({
          jobs,
          npmPlanEvidence,
          releases,
          releaseSha,
          requestedRepository,
          requestedRunId,
          requestedTag,
        });
  refuseExistingRemoteTag(remoteTagPresent, requestedTag);
  return evidence;
}

function runGh(args, { env, spawnSync, encoding }) {
  const result = spawnSync('gh', args, {
    encoding,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `GitHub recovery evidence lookup failed: ${String(result.stderr ?? '').trim() || 'unknown gh error'}`,
    );
  }
  return result.stdout;
}

function runGhJson(args, options) {
  return JSON.parse(runGh(args, { ...options, encoding: 'utf8' }));
}

function flattenAnnotationPages(pages) {
  if (!Array.isArray(pages)) {
    return [];
  }
  return pages.flatMap((page) => (Array.isArray(page) ? page : []));
}

function remoteReleaseTagPresent({ env, repository, requestedTag, spawnSync }) {
  const result = spawnSync(
    'gh',
    ['api', `repos/${repository}/git/ref/tags/${requestedTag}`],
    {
      encoding: 'utf8',
      env,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status === 0) {
    return true;
  }
  const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (/Not Found|\b404\b/.test(detail)) {
    return false;
  }
  throw new Error('Could not verify whether the release tag already exists.');
}

function historicalShaIsAncestor(releaseSha, spawnSync) {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', releaseSha, 'origin/master'],
    { encoding: 'utf8' },
  );
  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }
  throw new Error(
    'Could not verify that the historical release SHA is still on master.',
  );
}

function assertOutputToken(value, pattern, label) {
  if (!pattern.test(String(value ?? ''))) {
    fail(`Refusing to publish unsafe recovery output ${label}.`);
  }
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
    const jobs = jobPages.flatMap((page) => page.jobs ?? []);
    const planJobs = jobs.filter((job) => job.name === NPM_PLAN_JOB_NAME);
    let npmPlanEvidence;
    if (planJobs.length === 1) {
      const planJobId = planJobs[0].id;
      if (!Number.isSafeInteger(planJobId) || planJobId <= 0) {
        fail('npm plan evidence has an invalid job ID.');
      }
      const annotationPages = runGhJson(
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${repository}/check-runs/${planJobId}/annotations`,
        ],
        { env, spawnSync },
      );
      npmPlanEvidence = {
        annotations: flattenAnnotationPages(annotationPages),
        log: runGh(
          [
            'api',
            '--allow-escape-sequences',
            `repos/${repository}/actions/jobs/${planJobId}/logs`,
          ],
          { env, spawnSync, encoding: 'utf8' },
        ),
      };
    }
    const releaseSha = run.head_sha ?? '';
    const evidence = validateReleaseRecoveryEvidence({
      jobs,
      npmPlanEvidence,
      releases: releasePages.flat(),
      remoteTagPresent: remoteReleaseTagPresent({
        env,
        repository,
        requestedTag,
        spawnSync,
      }),
      requestedRepository: repository,
      requestedRunId: runId,
      requestedTag,
      run,
      sourceIsAncestor: SHA_PATTERN.test(releaseSha)
        ? historicalShaIsAncestor(releaseSha, spawnSync)
        : undefined,
    });
    const outputToken = /^[A-Za-z0-9_.:-]+$/;
    for (const [label, value] of [
      ['artifact_job_id', evidence.artifactJobId],
      ['archive_asset_digest', evidence.archiveAssetDigest],
      ['archive_asset_id', evidence.archiveAssetId],
      ['archive_asset_size', evidence.archiveAssetSize],
      ['changelog_asset_digest', evidence.changelogAssetDigest],
      ['changelog_asset_id', evidence.changelogAssetId],
      ['changelog_asset_size', evidence.changelogAssetSize],
      ['checksum_asset_digest', evidence.checksumAssetDigest],
      ['checksum_asset_id', evidence.checksumAssetId],
      ['checksum_asset_size', evidence.checksumAssetSize],
      ['draft_body_sha256', evidence.draftBodySha256],
      ['draft_id', evidence.draftId],
      ['draft_title', evidence.draftTitle],
      ['image_digest', evidence.imageDigest],
      ['recovery_kind', evidence.recoveryKind],
      ['release_sha', evidence.releaseSha],
    ]) {
      if (value !== '') {
        assertOutputToken(value, outputToken, label);
      }
    }

    appendFileSync(
      env.GITHUB_OUTPUT,
      [
        `archive_asset_digest=${evidence.archiveAssetDigest}`,
        `archive_asset_id=${evidence.archiveAssetId}`,
        `archive_asset_size=${evidence.archiveAssetSize}`,
        `artifact_job_id=${evidence.artifactJobId}`,
        `changelog_asset_digest=${evidence.changelogAssetDigest}`,
        `changelog_asset_id=${evidence.changelogAssetId}`,
        `changelog_asset_size=${evidence.changelogAssetSize}`,
        `checksum_asset_digest=${evidence.checksumAssetDigest}`,
        `checksum_asset_id=${evidence.checksumAssetId}`,
        `checksum_asset_size=${evidence.checksumAssetSize}`,
        `draft_body_sha256=${evidence.draftBodySha256}`,
        `draft_id=${evidence.draftId}`,
        `draft_title=${evidence.draftTitle}`,
        `image_digest=${evidence.imageDigest}`,
        `recovery_kind=${evidence.recoveryKind}`,
        'recovery_mode=true',
        `recovery_run_id=${runId}`,
        'recovery_saas_verified=true',
        'recovery_suite_verified=true',
        `release_sha=${evidence.releaseSha}`,
        '',
      ].join('\n'),
    );

    if (env.GITHUB_STEP_SUMMARY) {
      const lines =
        evidence.recoveryKind === RECOVERY_KIND_NPM_SOURCE_NOOP
          ? [
              '## Partial release recovery evidence',
              '',
              `- Prior run: ${runId}`,
              `- Release: \`${requestedTag}\``,
              `- Pinned SHA: \`${evidence.releaseSha}\``,
              '- Recovery kind: `npm-source-noop`',
              '- Full Suite: proved green from the prior run',
              '- Public hosted SaaS: proved green from the prior run, including server promotion',
              '- Community image and install assets: proved green; bytes and the reviewed image digest will be rechecked, not rebuilt',
              `- Historical image digest: ${evidence.imageDigest}`,
              '- npm plan: failed only because master advanced after dispatch',
              '- npm preflight, npm publication, Community promotion, and GitHub publication: proved skipped',
              `- Existing archive asset: ${evidence.archiveAssetId} (${evidence.archiveAssetDigest})`,
              `- Existing checksum asset: ${evidence.checksumAssetId} (${evidence.checksumAssetDigest})`,
              `- Historical changelog asset: ${evidence.changelogAssetId} (${evidence.changelogAssetDigest})`,
              '',
            ]
          : [
              '## Partial release recovery evidence',
              '',
              `- Prior run: ${runId}`,
              `- Release: \`${requestedTag}\``,
              `- Pinned SHA: \`${evidence.releaseSha}\``,
              '- Recovery kind: `attachment-failure`',
              '- Full Suite: proved green from the prior run',
              '- Public hosted SaaS: proved green from the prior run',
              '- Community image: prior build/push proved green; the exact image will be reused and reverified',
              '- Bundle build, smoke, and exact-image verification: proved green; only draft attachment failed',
              `- Failed attachment job: ${evidence.artifactJobId}`,
              '- Irreversible promotion, npm, and publication jobs: proved skipped',
              '- Existing install assets: none',
              `- Historical changelog asset: ${evidence.changelogAssetId} (${evidence.changelogAssetDigest})`,
              '',
            ];
      appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n'));
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
