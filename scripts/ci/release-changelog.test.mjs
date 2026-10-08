import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  runRecoveryNpmPlanGuard,
  validateRecoveryNpmPlan,
} from './recovery-npm-plan-guard.mjs';
import {
  loadReleaseRecoveryQualifications,
  NPM_MASTER_ADVANCED_ERROR,
  NPM_SOURCE_NOOP_CURRENT_FULL_SUITE_JOBS,
  NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS,
  NPM_SOURCE_NOOP_REQUIRED_SKIPPED_JOBS,
  RECOVERY_KIND_ATTACHMENT_FAILURE,
  RECOVERY_KIND_NPM_SOURCE_NOOP,
  runReleaseRecoveryCli,
  validateReleaseRecoveryEvidence,
} from './release-recovery-evidence.mjs';

// Contract for the OSS release tooling decided in #2995 (children #2999, #3001):
// one repo version, a generated changelog, and a Conventional Commits PR title
// that becomes the squash subject and the changelog line.

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function readRepoFile(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8');
}

const releaseWorkflow = readRepoFile('.github/workflows/release.yml');
const selfHostedWorkflow = readRepoFile(
  '.github/workflows/_publish-selfhosted-core.yml',
);
const releasingGuide = readRepoFile('RELEASING.md');
const recoveryEvidenceScript = readRepoFile(
  'scripts/ci/release-recovery-evidence.mjs',
);
const recoveryNpmGuardPath = fileURLToPath(
  new URL('./recovery-npm-plan-guard.mjs', import.meta.url),
);
const prTitleWorkflow = readRepoFile('.github/workflows/pr-title.yml');
const cliffConfig = readRepoFile('cliff.toml');
const pullRequestTemplate = readRepoFile('.github/pull_request_template.md');
const rootPackage = JSON.parse(readRepoFile('package.json'));

function jobBlock(workflow, jobId, fileName) {
  const match = workflow.match(
    new RegExp(`^ {2}${jobId}:\\n((?: {4}.*(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `${fileName} must define the ${jobId} job`);
  return match[1];
}

function conventionalTypesFromTemplate() {
  const match = pullRequestTemplate.match(/\(((?:\w+, )+\w+)\)\. Lowercase/);
  assert.ok(
    match,
    'pull_request_template.md must list the allowed Conventional Commits types',
  );
  return match[1].split(', ');
}

const RECOVERY_SHA = '87fd8fff5bd429ae224c7501fc7c772b838365a4';
const RECOVERY_RUN_ID = '32272857631';
const RECOVERY_TAG = 'v0.1.66';
const REQUIRED_SUITE_JOBS = [
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
  ...Array.from(
    { length: 4 },
    (_, index) => `Full Suite / CI Gate / Test API (Shard ${index + 1}/4)`,
  ),
  ...Array.from(
    { length: 4 },
    (_, index) => `Full Suite / CI Gate / Test App (Shard ${index + 1}/4)`,
  ),
  'Full Suite / CI Gate / Build',
  'Full Suite / E2E Suite / Frontend Authed E2E (real Better Auth)',
  'Full Suite / E2E Suite / E2E Route Reference Inventory',
  'Full Suite / E2E Suite / API E2E Tests',
  ...Array.from(
    { length: 4 },
    (_, index) =>
      `Full Suite / E2E Suite / Frontend E2E (Shard ${index + 1}/4)`,
  ),
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
const ARTIFACT_JOB_NAME =
  'Publish Community / Publish & Smoke Public Install Artifact';
const ARTIFACT_STEPS = [
  'Set up job',
  'Checkout release source',
  'Setup create package',
  'Test and build create package',
  'Build version-pinned release bundle',
  'Smoke create against the release bundle',
  'Anonymous exact-image pull and metadata check',
  'Attach install bundle to draft GitHub release',
  'Post Setup create package',
  'Post Checkout release source',
  'Complete job',
];

function recoveryJob(name, conclusion = 'success', steps) {
  return {
    conclusion,
    head_sha: RECOVERY_SHA,
    id:
      name === ARTIFACT_JOB_NAME
        ? 96166230801
        : [...name].reduce(
            (value, character) =>
              (value * 31 + character.charCodeAt(0)) % 1_000_000,
            1,
          ) + 1,
    name,
    status: 'completed',
    ...(steps ? { steps } : {}),
  };
}

function releaseRecoveryFixture() {
  const artifactSteps = ARTIFACT_STEPS.map((name, index) => ({
    conclusion:
      name === 'Attach install bundle to draft GitHub release'
        ? 'failure'
        : 'success',
    name,
    number: index + 1,
    status: 'completed',
  }));

  return {
    jobs: [
      ...REQUIRED_SUITE_JOBS.map((name) => recoveryJob(name)),
      ...PUBLIC_SAAS_JOBS.map((name) => recoveryJob(name)),
      recoveryJob('Deploy hosted SaaS through private operations', 'skipped'),
      recoveryJob('Validate release and create draft'),
      recoveryJob(
        'Publish Community / Self-Hosted Build Verify / Build & Boot Check (Self-Hosted)',
      ),
      recoveryJob('Publish Community / Build & Push Self-Hosted Image'),
      recoveryJob(ARTIFACT_JOB_NAME, 'failure', artifactSteps),
      recoveryJob('Publish npm Packages', 'skipped'),
      recoveryJob('Promote Community release channels', 'skipped'),
      recoveryJob('Publish GitHub release', 'skipped'),
    ],
    releases: [
      {
        assets: [
          {
            digest:
              'sha256:41a43afec3135a6d2b9bdc5197f7d11f500bc42d56d87eba2f3bd6aa1b857875',
            id: 521044448,
            name: 'CHANGELOG.md',
            size: 255112,
            state: 'uploaded',
          },
        ],
        body: 'Existing release notes\n',
        draft: true,
        id: 373178897,
        name: RECOVERY_TAG,
        published_at: null,
        tag_name: RECOVERY_TAG,
        target_commitish: RECOVERY_SHA,
      },
    ],
    requestedRepository: 'genfeedai/genfeed.ai',
    requestedRunId: RECOVERY_RUN_ID,
    requestedTag: RECOVERY_TAG,
    run: {
      conclusion: 'failure',
      display_title: `Release ${RECOVERY_TAG}`,
      event: 'workflow_dispatch',
      head_branch: 'master',
      head_repository: { full_name: 'genfeedai/genfeed.ai' },
      head_sha: RECOVERY_SHA,
      id: Number(RECOVERY_RUN_ID),
      path: '.github/workflows/release.yml',
      repository: { full_name: 'genfeedai/genfeed.ai' },
      status: 'completed',
    },
  };
}

test('validates complete historical recovery evidence from fixture data', () => {
  const result = validateReleaseRecoveryEvidence(releaseRecoveryFixture());

  assert.equal(result.releaseSha, RECOVERY_SHA);
  assert.equal(result.artifactJobId, '96166230801');
  assert.equal(result.draftId, '373178897');
  assert.equal(result.draftTitle, RECOVERY_TAG);
  assert.equal(
    result.draftBodySha256,
    '23d5465b6cdf5f0bd6e0c0cdc6515f8822bfb5ee57c193ef8104bb0d9dfd2708',
  );
  assert.equal(result.changelogAssetId, '521044448');
  assert.equal(
    result.changelogAssetDigest,
    'sha256:41a43afec3135a6d2b9bdc5197f7d11f500bc42d56d87eba2f3bd6aa1b857875',
  );
  assert.equal(result.changelogAssetSize, '255112');
  assert.equal(result.recoveryKind, RECOVERY_KIND_ATTACHMENT_FAILURE);
  assert.equal(result.imageDigest, '');
  assert.equal(result.archiveAssetId, '');
  assert.equal(result.archiveAssetDigest, '');
  assert.equal(result.checksumAssetId, '');
  assert.equal(result.checksumAssetSize, '');
});

test('requires public deploy receipts even when private operations succeeded', () => {
  const fixture = releaseRecoveryFixture();
  fixture.jobs = fixture.jobs.filter(
    (job) => !PUBLIC_SAAS_JOBS.includes(job.name),
  );
  fixture.jobs.find(
    (job) => job.name === 'Deploy hosted SaaS through private operations',
  ).conclusion = 'success';
  assert.throws(
    () => validateReleaseRecoveryEvidence(fixture),
    /requires exactly one Deploy hosted SaaS/,
  );
});

test('recovery accepts public-only runs with no retired operations job', () => {
  const fixture = releaseRecoveryFixture();
  fixture.jobs = fixture.jobs.filter(
    (job) => job.name !== 'Deploy hosted SaaS through private operations',
  );
  assert.equal(
    validateReleaseRecoveryEvidence(fixture).releaseSha,
    RECOVERY_SHA,
  );
});

test('rejects a recovery draft that already has versioned install assets', () => {
  for (const name of [
    'genfeed-selfhosted.tar.gz',
    'genfeed-selfhosted.tar.gz.sha256',
  ]) {
    const fixture = releaseRecoveryFixture();
    fixture.releases[0].assets.push({
      digest: `sha256:${'a'.repeat(64)}`,
      id: 600000000,
      name,
      size: 100,
      state: 'uploaded',
    });

    assert.throws(
      () => validateReleaseRecoveryEvidence(fixture),
      /must not already contain versioned install assets/,
    );
  }
});

test('requires one immutable non-empty historical changelog asset', () => {
  for (const mutate of [
    (asset) => {
      asset.size = 0;
    },
    (asset) => {
      asset.digest = null;
    },
    (_asset, release) => {
      release.assets.push({ ...release.assets[0], id: 521044449 });
    },
  ]) {
    const fixture = releaseRecoveryFixture();
    mutate(fixture.releases[0].assets[0], fixture.releases[0]);
    assert.throws(
      () => validateReleaseRecoveryEvidence(fixture),
      /exactly one non-empty, uploaded CHANGELOG\.md asset with a sha256 digest/,
    );
  }
});

test('proves only the final historical attachment step failed', () => {
  const prerequisiteFailure = releaseRecoveryFixture();
  const artifactJob = prerequisiteFailure.jobs.find(
    (job) => job.name === ARTIFACT_JOB_NAME,
  );
  artifactJob.steps.find(
    (step) => step.name === 'Smoke create against the release bundle',
  ).conclusion = 'failure';
  assert.throws(
    () => validateReleaseRecoveryEvidence(prerequisiteFailure),
    /Smoke create against the release bundle.*expected success/,
  );

  const attachmentSucceeded = releaseRecoveryFixture();
  attachmentSucceeded.jobs
    .find((job) => job.name === ARTIFACT_JOB_NAME)
    .steps.find(
      (step) => step.name === 'Attach install bundle to draft GitHub release',
    ).conclusion = 'success';
  assert.throws(
    () => validateReleaseRecoveryEvidence(attachmentSucceeded),
    /Attach install bundle to draft GitHub release.*expected failure/,
  );
});

test('rejects mismatched run identity and wrong-SHA gate evidence', () => {
  const wrongRun = releaseRecoveryFixture();
  wrongRun.run.display_title = 'Release v9.9.9';
  assert.throws(
    () => validateReleaseRecoveryEvidence(wrongRun),
    /display title.*expected Release v0\.1\.66/,
  );

  const wrongSha = releaseRecoveryFixture();
  wrongSha.jobs.find(
    (job) => job.name === 'Full Suite / CI Gate / Build',
  ).head_sha = 'a'.repeat(40);
  assert.throws(
    () => validateReleaseRecoveryEvidence(wrongSha),
    /incomplete, failed, or wrong-SHA Full Suite jobs/,
  );
});

test('rejects a renamed historical recovery draft', () => {
  const fixture = releaseRecoveryFixture();
  fixture.releases[0].name = 'Renamed draft';

  assert.throws(
    () => validateReleaseRecoveryEvidence(fixture),
    /title Renamed draft, expected v0\.1\.66/,
  );
});

test('allows historical npm recovery only when the registry plan is empty', () => {
  assert.deepEqual(
    validateRecoveryNpmPlan({
      hasPackages: 'false',
      recoveryRunId: RECOVERY_RUN_ID,
      validatedHistoricalRecovery: 'true',
    }),
    {
      hasPackages: false,
      recoveryRunId: RECOVERY_RUN_ID,
    },
  );

  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        hasPackages: 'true',
        recoveryRunId: RECOVERY_RUN_ID,
        validatedHistoricalRecovery: 'true',
      }),
    /cannot publish pending npm packages.*new release from current master/i,
  );
});

test('historical npm recovery fails closed on incomplete evidence', () => {
  const valid = {
    hasPackages: 'false',
    recoveryRunId: RECOVERY_RUN_ID,
    validatedHistoricalRecovery: 'true',
  };

  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        ...valid,
        validatedHistoricalRecovery: 'false',
      }),
    /validated historical recovery/i,
  );
  assert.throws(
    () => validateRecoveryNpmPlan({ ...valid, recoveryRunId: '' }),
    /positive recovery run ID/i,
  );
  assert.throws(
    () => validateRecoveryNpmPlan({ ...valid, hasPackages: 'unknown' }),
    /has_packages must be exactly true or false/i,
  );
});

test('historical npm recovery reports its verified no-op', () => {
  const output = [];
  const result = runRecoveryNpmPlanGuard({
    env: {
      HAS_PACKAGES: 'false',
      RECOVERY_RUN_ID,
      VALIDATED_HISTORICAL_RECOVERY: 'true',
    },
    write: (message) => output.push(message),
  });

  assert.equal(result.hasPackages, false);
  assert.deepEqual(output, [
    `Historical recovery ${RECOVERY_RUN_ID} has an empty npm plan; no registry publication will run.`,
  ]);
});

function runRecoveryNpmPlanGuardCli(scriptPath, env) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('direct invocation of the npm recovery guard does not silently exit 0', () => {
  const result = runRecoveryNpmPlanGuardCli(recoveryNpmGuardPath, {
    HAS_PACKAGES: '',
    RECOVERY_RUN_ID: '',
    VALIDATED_HISTORICAL_RECOVERY: '',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /validated historical recovery/i);
});

test('symlinked npm recovery guard still executes and fails on a non-empty plan', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'recovery-npm-guard-'));

  try {
    const symlinkPath = path.join(tempDir, 'recovery-npm-plan-guard.mjs');
    symlinkSync(recoveryNpmGuardPath, symlinkPath);

    const emptyPlan = runRecoveryNpmPlanGuardCli(symlinkPath, {
      HAS_PACKAGES: 'false',
      RECOVERY_RUN_ID,
      VALIDATED_HISTORICAL_RECOVERY: 'true',
    });
    assert.equal(emptyPlan.status, 0);
    assert.match(emptyPlan.stdout, /empty npm plan/);

    const pendingPlan = runRecoveryNpmPlanGuardCli(symlinkPath, {
      HAS_PACKAGES: 'true',
      RECOVERY_RUN_ID,
      VALIDATED_HISTORICAL_RECOVERY: 'true',
    });
    assert.notEqual(pendingPlan.status, 0);
    assert.match(
      pendingPlan.stderr,
      /cannot publish pending npm packages.*new release from current master/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('release ties the dispatched tag to the root package.json version', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');

  assert.match(
    validate,
    /Validate release tag shape[\s\S]*?\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/,
    'the tag shape is validated before it reaches any action argument',
  );
  assert.match(
    validate,
    /package_version="\$\(jq -r '\.version' package\.json\)"/,
  );
  assert.match(
    validate,
    /if \[ "v\$\{package_version\}" != "\$\{REQUESTED_TAG\}" \]; then/,
  );
  assert.match(
    rootPackage.version,
    /^\d+\.\d+\.\d+$/,
    'root package.json carries the plain semver that the release tag prefixes with v',
  );
});

test('release notes and CHANGELOG.md are generated by git-cliff, never by GitHub', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');

  assert.doesNotMatch(validate, /--generate-notes/);
  assert.match(
    validate,
    /uses: orhun\/git-cliff-action@[0-9a-f]{40} # v4\.\d+\.\d+/,
  );
  assert.match(validate, /config: cliff\.toml/);
  assert.match(
    validate,
    /args: --unreleased --tag \$\{\{ inputs\.tag \}\} --strip header[\s\S]*?OUTPUT: release-notes\.md/,
    'the release body is the unreleased section for the dispatched tag',
  );
  assert.match(
    validate,
    /args: --tag \$\{\{ inputs\.tag \}\}\n[\s\S]*?OUTPUT: CHANGELOG\.md/,
    'the full changelog is generated for the release asset',
  );
  assert.match(
    validate,
    /gh release create "\$\{release_tag\}" \\\n\s+--draft \\\n\s+--notes-file release-notes\.md/,
  );
  assert.match(
    validate,
    /gh release edit "\$\{release_tag\}" --notes-file release-notes\.md/,
    'a reused draft gets refreshed notes instead of stale ones',
  );
  assert.match(
    validate,
    /gh release upload "\$\{release_tag\}" CHANGELOG\.md --clobber/,
  );
});

test('failed stable releases recover only from exact historical run evidence', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');

  assert.match(releaseWorkflow, /^ {6}recovery_run_id:\n/m);
  assert.match(releaseWorkflow, /^ {8}required: false\n {8}type: string$/m);
  assert.match(
    validate,
    /RECOVERY_RUN_ID: \$\{\{ inputs\.recovery_run_id \}\}/,
  );
  assert.match(validate, /node scripts\/ci\/release-recovery-evidence\.mjs/);
  assert.match(recoveryEvidenceScript, /actions\/runs\/\$\{runId\}/);
  assert.match(
    recoveryEvidenceScript,
    /actions\/runs\/\$\{runId\}\/jobs\?filter=latest&per_page=100/,
  );

  for (const evidence of [
    'Full Suite / CI Gate / Build',
    'Full Suite / E2E Suite / E2E Gate (all shards)',
    'Full Suite / Build & Boot Check / Build & Boot Check',
    'Deploy hosted SaaS / Deploy hosted SaaS / Deploy ECS',
    'Deploy hosted SaaS / Deploy hosted SaaS / Post-deploy smoke',
    'Publish Community / Build & Push Self-Hosted Image',
    'Publish Community / Publish & Smoke Public Install Artifact',
    'Publish npm Packages',
    'Promote Community release channels',
    'Publish GitHub release',
  ]) {
    assert.ok(
      recoveryEvidenceScript.includes(evidence),
      `release recovery must validate ${evidence}`,
    );
  }

  assert.match(recoveryEvidenceScript, /target_commitish.*releaseSha/);
  assert.match(validate, /draft_body_sha256/);
  assert.match(validate, /Preserving its existing title and release notes/);
  assert.match(
    validate,
    /ref: \$\{\{ steps\.source\.outputs\.release_sha \}\}/,
    'every recovery build must check out the historical source SHA',
  );
});

test('an incomplete published latest release can be rebuilt from current master under the same version', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');
  const verifySuite = jobBlock(releaseWorkflow, 'verify-suite', 'release.yml');
  const deploySaas = jobBlock(releaseWorkflow, 'deploy-saas', 'release.yml');
  const publish = jobBlock(releaseWorkflow, 'publish-release', 'release.yml');

  assert.match(releaseWorkflow, /^ {6}repair_published_release:\n/m);
  assert.match(
    releaseWorkflow,
    /repair_published_release:[\s\S]*?type: boolean[\s\S]*?default: false/,
  );
  assert.match(
    validate,
    /Historical run recovery and published-release repair are mutually exclusive/,
  );
  assert.match(
    validate,
    /already has the complete public install contract; refusing destructive repair/,
  );
  assert.match(
    validate,
    /gh release edit "\$\{release_tag\}" \\\n\s+--draft \\\n\s+--notes-file release-notes\.md \\\n\s+--target "\$\{release_sha\}"/,
  );
  assert.match(
    validate,
    /gh api --method DELETE "repos\/\$\{GITHUB_REPOSITORY\}\/git\/refs\/tags\/\$\{release_tag\}"/,
    'the stale tag is removed only after the broken release is converted to a draft',
  );
  assert.match(
    validate,
    /Release \$\{release_tag\} did not become an unpublished draft at \$\{release_sha\}/,
  );
  assert.match(
    verifySuite,
    /inputs\.recovery_run_id == ''/,
    'published repair must rerun the complete suite from current master',
  );
  assert.match(
    deploySaas,
    /inputs\.recovery_run_id == ''/,
    'published repair must redeploy hosted SaaS from the same current master SHA',
  );
  assert.match(
    publish,
    /Git tag \$\{RELEASE_TAG\} appeared before the verified draft was published/,
  );
  assert.match(
    publish,
    /gh release edit "\$\{RELEASE_TAG\}" --draft=false --latest/,
    'the same version becomes public only after assets, SaaS, npm, and promotion are green',
  );
  assert.match(
    publish,
    /resolve_published_tag_sha/,
    'publishing must resolve the recreated Git tag instead of trusting release target metadata',
  );
  assert.match(publish, /git\/ref\/tags\/\$\{RELEASE_TAG\}/);
  assert.match(publish, /git\/tags\/\$\{object_sha\}/);
  assert.match(
    publish,
    /published_tag_sha.*RELEASE_SHA/,
    'publishing must prove the recreated tag resolves to the pinned release SHA',
  );
  assert.match(
    publish,
    /rollback_published_release/,
    'a failed post-publish integrity check must return the release to a repairable draft',
  );
});

test('recovery skips proved-green gates and reuses the exact immutable image', () => {
  const verifySuite = jobBlock(releaseWorkflow, 'verify-suite', 'release.yml');
  const publishCommunity = jobBlock(
    releaseWorkflow,
    'publish-community',
    'release.yml',
  );
  const deploySaas = jobBlock(releaseWorkflow, 'deploy-saas', 'release.yml');
  const imageBuild = jobBlock(
    selfHostedWorkflow,
    'build-and-push',
    '_publish-selfhosted-core.yml',
  );

  assert.match(verifySuite, /inputs\.recovery_run_id == ''/);
  assert.match(deploySaas, /inputs\.recovery_run_id == ''/);
  assert.match(publishCommunity, /recovery_suite_verified == 'true'/);
  assert.match(publishCommunity, /reuse_existing_image:/);

  assert.match(selfHostedWorkflow, /^ {6}reuse_existing_image:\n/m);
  assert.match(
    selfHostedWorkflow,
    /if: \$\{\{ inputs\.reuse_existing_image != true \}\}/,
  );
  assert.match(selfHostedWorkflow, /image_digest:/);
  assert.match(
    selfHostedWorkflow,
    /overwrite_files: \$\{\{ inputs\.reuse_existing_image != true \}\}/,
  );
  assert.match(
    selfHostedWorkflow,
    /Refuse pre-existing versioned install assets/,
  );
  assert.match(selfHostedWorkflow, /install_asset_count/);
  assert.match(selfHostedWorkflow, /local_digest="sha256:\$\(sha256sum/);
  assert.match(selfHostedWorkflow, /archive_asset_id:/);
  assert.match(selfHostedWorkflow, /archive_asset_digest:/);
  assert.match(selfHostedWorkflow, /checksum_asset_id:/);
  assert.match(selfHostedWorkflow, /checksum_asset_digest:/);
  assert.match(selfHostedWorkflow, /org\.opencontainers\.image\.revision/);
  assert.match(selfHostedWorkflow, /actual_revision.*EXPECTED_REVISION/);
  assert.match(
    imageBuild,
    /permissions:\n {6}contents: read\n {6}packages: write/,
  );

  const promote = jobBlock(releaseWorkflow, 'promote-community', 'release.yml');
  assert.match(
    promote,
    /IMAGE_DIGEST: \$\{\{ needs\.validate-release\.outputs\.recovery_kind == 'npm-source-noop' && needs\.verify-recovered-assets\.outputs\.image_digest \|\| needs\.publish-community\.outputs\.image_digest \}\}/,
  );
  assert.match(promote, /"\$\{IMAGE\}@\$\{IMAGE_DIGEST\}"/);
});

test('publisher and promoter compare the same registry manifest digest identity', () => {
  const promote = jobBlock(releaseWorkflow, 'promote-community', 'release.yml');

  assert.match(
    selfHostedWorkflow,
    /canonical_repo="ghcr\.io\/\$\{GITHUB_REPOSITORY\}"/,
  );
  assert.match(
    selfHostedWorkflow,
    /docker image inspect "\$\{image\}" --format '\{\{json \.RepoDigests\}\}'/,
  );
  assert.match(
    selfHostedWorkflow,
    /map\(select\(startswith\(\$repo \+ "@"\)\)\) \| first \/\/ empty/,
  );
  assert.doesNotMatch(selfHostedWorkflow, /index \.RepoDigests 0/);

  assert.match(
    promote,
    /imagetools inspect "\$\{IMAGE\}:\$\{IMAGE_TAG\}" --format '\{\{json \.Manifest\.Digest\}\}'/,
  );
  assert.doesNotMatch(
    promote,
    /imagetools inspect "\$\{IMAGE\}:\$\{IMAGE_TAG\}" --raw \| sha256sum/,
  );
});

test('draft titles must equal the single-line release tag before GITHUB_OUTPUT', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');

  assert.match(
    validate,
    /if \[ "\$\{draft_title\}" != "\$\{release_tag\}" \]; then\n\s+echo "::error::Draft \$\{release_tag\} has title \$\{draft_title\}, expected \$\{release_tag\}\."\n\s+exit 1\n\s+fi\n[\s\S]*echo "draft_title=\$\{draft_title\}"[\s\S]*>>"\$\{GITHUB_OUTPUT\}"/,
  );
  assert.doesNotMatch(
    validate,
    /echo "draft_title=\$\{draft_title\}"[\s\S]*if \[ "\$\{draft_title\}" != "\$\{release_tag\}" \]; then/,
  );
});

test('RELEASING.md distinguishes normal SHA equality from historical recovery ancestry', () => {
  assert.match(
    releasingGuide,
    /A normal release requires the pinned SHA to equal\ncurrent `master`; a validated historical recovery requires the recovered SHA to\nremain an ancestor of current `master`\./,
  );
  assert.match(
    releasingGuide,
    /This lets the `v0\.1\.66` recovery preserve truthful npm\nprovenance because its verified plan is a no-op/,
  );
  assert.doesNotMatch(
    releasingGuide,
    /npm publication always requires the pinned SHA to\nequal current `master`/,
  );
  assert.doesNotMatch(releasingGuide, /the v66 recovery/);
  assert.match(
    releasingGuide,
    /this second mode requires a trusted\nreviewed controller qualification/,
  );
  assert.match(
    releasingGuide,
    /only run\n`37484284049`, tag `v0\.2\.3`, and source\n`1c228e1a2bce02234a8f317d4f8f32659c2d3cb9`/,
  );
  assert.match(
    releasingGuide,
    /An unknown run fails closed until a\nreviewed qualification record exists/,
  );
  assert.match(
    releasingGuide,
    /does not adopt whatever the tag currently displays/,
  );
  assert.match(
    releasingGuide,
    /only after the registry-drift plan succeeds\nand is empty/,
  );
});

test('recovery gates irreversible promotion and preserves the draft until publication', () => {
  for (const jobId of [
    'promote-community',
    'publish-packages',
    'publish-release',
  ]) {
    const job = jobBlock(releaseWorkflow, jobId, 'release.yml');
    assert.match(job, /recovery_saas_verified == 'true'/);
    assert.match(job, /needs\.publish-community\.result == 'success'/);
  }

  const promote = jobBlock(releaseWorkflow, 'promote-community', 'release.yml');
  assert.match(promote, /^ {6}- publish-packages$/m);
  assert.match(promote, /needs\.publish-packages\.result == 'success'/);

  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');
  assert.match(validate, /RECOVERY_DRAFT_ID/);
  assert.match(validate, /RECOVERY_DRAFT_BODY_SHA256/);
  assert.match(validate, /RECOVERY_DRAFT_TITLE/);
  assert.match(validate, /draft_target.*release_sha/);

  const publish = jobBlock(releaseWorkflow, 'publish-release', 'release.yml');
  assert.match(publish, /EXPECTED_DRAFT_ID/);
  assert.match(publish, /EXPECTED_DRAFT_BODY_SHA256/);
  assert.match(publish, /EXPECTED_DRAFT_TITLE/);
  assert.match(publish, /EXPECTED_CHANGELOG_ASSET_ID/);
  assert.match(publish, /EXPECTED_CHANGELOG_ASSET_DIGEST/);
  assert.match(publish, /EXPECTED_CHANGELOG_ASSET_SIZE/);
  assert.match(publish, /EXPECTED_ARCHIVE_ASSET_ID/);
  assert.match(publish, /EXPECTED_ARCHIVE_ASSET_DIGEST/);
  assert.match(publish, /EXPECTED_CHECKSUM_ASSET_ID/);
  assert.match(publish, /EXPECTED_CHECKSUM_ASSET_DIGEST/);
  assert.match(publish, /genfeed-selfhosted\.tar\.gz/);
  assert.match(publish, /genfeed-selfhosted\.tar\.gz\.sha256/);
  assert.match(
    publish,
    /gh release edit "\$\{RELEASE_TAG\}" --draft=false --latest/,
  );
});

test('cliff.toml groups Conventional Commit PR titles and links squash PR numbers', () => {
  assert.match(cliffConfig, /^conventional_commits = true$/m);
  assert.match(cliffConfig, /^tag_pattern = "v\[0-9\]\.\*"$/m);
  assert.match(
    cliffConfig,
    /^skip_tags = "desktop-v\.\*\|mobile-v\.\*\|extension-browser-v\.\*"$/m,
    'independent surfaces never appear in the repo changelog',
  );
  assert.match(cliffConfig, /^protect_breaking_commits = true$/m);
  assert.match(cliffConfig, /### ⚠ Upgrade note/);
  assert.match(
    cliffConfig,
    /replace = "\(\[#\$\{2\}\]\(<REPO>\/pull\/\$\{2\}\)\)"/,
    'squash-merge PR numbers become links',
  );
  assert.match(
    cliffConfig,
    /pattern = '<REPO>', replace = "https:\/\/github\.com\/genfeedai\/genfeed\.ai"/,
  );

  for (const type of conventionalTypesFromTemplate()) {
    assert.match(
      cliffConfig,
      new RegExp(`message = "\\^[^"]*\\b${type}\\b[^"]*"`),
      `cliff.toml must route ${type} commits into a section`,
    );
  }
});

test('PR titles are checked without executing fork code and stay in sync with the contract', () => {
  assert.match(
    prTitleWorkflow,
    /^ {2}pull_request_target:\n {4}types: \[opened, edited, synchronize, reopened\]$/m,
  );
  assert.doesNotMatch(
    prTitleWorkflow,
    /^ {2}pull_request:/m,
    'the check must not need run-ci approval',
  );
  assert.doesNotMatch(
    prTitleWorkflow,
    /actions\/checkout/,
    'pull_request_target must never check out PR code',
  );
  assert.match(prTitleWorkflow, /^permissions:\n {2}pull-requests: read$/m);
  assert.match(
    prTitleWorkflow,
    /uses: amannn\/action-semantic-pull-request@[0-9a-f]{40} # v6\.\d+\.\d+/,
  );
  assert.match(
    prTitleWorkflow,
    /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/,
  );
  assert.doesNotMatch(
    prTitleWorkflow,
    /merge_group/,
    'master has no merge queue; PR Title reports on the pull request only',
  );

  const typesBlock = prTitleWorkflow.match(
    /^ {10}types: \|\n((?: {12}\w+\n)+)/m,
  );
  assert.ok(typesBlock, 'pr-title.yml must list the allowed types');
  const workflowTypes = typesBlock[1].trim().split(/\s+/).sort();
  assert.deepEqual(
    workflowTypes,
    [...conventionalTypesFromTemplate()].sort(),
    'pr-title.yml types must equal the list in pull_request_template.md',
  );
});

test('recovery accepts the historical route inventory display name and rejects duplicate aliases', () => {
  const fixture = releaseRecoveryFixture();
  const job = fixture.jobs.find(
    ({ name }) =>
      name === 'Full Suite / E2E Suite / E2E Route Reference Inventory',
  );
  assert.ok(job);
  job.name = 'Full Suite / E2E Suite / E2E Route Coverage Gate';
  assert.equal(
    validateReleaseRecoveryEvidence(fixture).releaseSha,
    RECOVERY_SHA,
  );
  fixture.jobs.push(
    recoveryJob('Full Suite / E2E Suite / E2E Route Reference Inventory'),
  );
  assert.throws(
    () => validateReleaseRecoveryEvidence(fixture),
    /exactly one .*E2E Route Reference Inventory job; found 2/,
  );
});

test('attachment recovery still rejects skipped artifact steps and install assets', () => {
  const skippedStep = releaseRecoveryFixture();
  skippedStep.jobs
    .find((job) => job.name === ARTIFACT_JOB_NAME)
    .steps.push({
      conclusion: 'skipped',
      name: 'Refuse pre-existing versioned install assets',
      status: 'completed',
    });
  assert.throws(
    () => validateReleaseRecoveryEvidence(skippedStep),
    /Only Attach install bundle to draft GitHub release may fail/,
  );

  const extraSuccess = releaseRecoveryFixture();
  extraSuccess.jobs
    .find((job) => job.name === ARTIFACT_JOB_NAME)
    .steps.push({
      conclusion: 'success',
      name: 'Verify immutable install asset identities',
      status: 'completed',
    });
  assert.equal(
    validateReleaseRecoveryEvidence(extraSuccess).recoveryKind,
    RECOVERY_KIND_ATTACHMENT_FAILURE,
  );
});

const RELEASE_RECOVERY_QUALIFICATIONS = JSON.parse(
  readRepoFile('scripts/ci/release-recovery-qualifications.json'),
);
const KNOWN_NPM_QUALIFICATION =
  RELEASE_RECOVERY_QUALIFICATIONS.qualifications[0];
const NPM_BODY_PATH = path.join(
  REPOSITORY_ROOT,
  'scripts/ci/fixtures/v0.2.3-release-body.txt',
);
const NPM_BODY = readFileSync(NPM_BODY_PATH, 'utf8');
const NPM_SHA = KNOWN_NPM_QUALIFICATION.releaseSha;
const NPM_RUN_ID = KNOWN_NPM_QUALIFICATION.runId;
const NPM_TAG = KNOWN_NPM_QUALIFICATION.releaseTag;
const NPM_PLAN_JOB_NAME =
  'Publish npm Packages / Plan npm release from registry drift';
const ORIGINAL_RELEASE_BODY_SHA256 =
  '5f957a363163984baf3ba9c734d90abb742cabda99cc52425f59fdf0e5fab941';
const NPM_PLAN_STEPS = [
  ['Set up job', 'success'],
  ['Reject real publishes outside the release workflow', 'skipped'],
  ['Require a master ref', 'success'],
  ['Checkout the pinned commit', 'success'],
  ['Validate pinned release source', 'failure'],
  ['Setup Bun environment', 'skipped'],
  ['Validate npm release enrollment', 'skipped'],
  ['Resolve packages to publish', 'skipped'],
  ['Checkout current release controller', 'skipped'],
  ['Require an empty npm plan for historical recovery', 'skipped'],
  ['Post Checkout the pinned commit', 'success'],
  ['Complete job', 'success'],
];
const NPM_ARTIFACT_STEPS = [
  ['Set up job', 'success'],
  ['Checkout release source', 'success'],
  ['Setup create package', 'success'],
  ['Test and build create package', 'success'],
  ['Build version-pinned release bundle', 'success'],
  ['Smoke create against the release bundle', 'success'],
  ['Anonymous exact-image pull and metadata check', 'success'],
  ['Refuse pre-existing versioned install assets', 'skipped'],
  ['Attach install bundle to draft GitHub release', 'success'],
  ['Verify immutable install asset identities', 'success'],
  ['Post Setup create package', 'success'],
  ['Post Checkout release source', 'success'],
  ['Complete job', 'success'],
];

let npmJobSerial = 2_000_000;

function npmEvidenceJob(name, conclusion = 'success', steps) {
  let id = npmJobSerial;
  npmJobSerial += 1;
  if (name === ARTIFACT_JOB_NAME) {
    id = 112372924619;
  }
  if (name === NPM_PLAN_JOB_NAME) {
    id = 112374484557;
  }
  return {
    conclusion,
    head_sha: NPM_SHA,
    id,
    name,
    status: 'completed',
    ...(steps ? { steps } : {}),
  };
}

function namedSteps(pairs) {
  return pairs.map(([name, conclusion], index) => ({
    conclusion,
    name,
    number: index + 1,
    status: 'completed',
  }));
}

function uploadedAsset(name, id, size, digest) {
  return { digest, id, name, size, state: 'uploaded' };
}

function colorPlanError(message) {
  return `\u001b[1;31m##[error]${message}\u001b[0m`;
}

function npmPlanEvidence({ annotations, log } = {}) {
  return {
    annotations: annotations ?? [
      {
        annotation_level: 'notice',
        message: 'ubuntu-latest labels will migrate on 2026-10-19',
      },
      { annotation_level: 'failure', message: NPM_MASTER_ADVANCED_ERROR },
      {
        annotation_level: 'failure',
        message: 'Process completed with exit code 1.',
      },
    ],
    log:
      log ??
      [
        '\u001b]0;npm plan\u0007',
        'echo "::error::The recovered release SHA must remain an ancestor of current master."',
        `echo "::error::${NPM_MASTER_ADVANCED_ERROR}"`,
        colorPlanError(NPM_MASTER_ADVANCED_ERROR),
        colorPlanError('Process completed with exit code 1.'),
      ].join('\n'),
  };
}

function knownNpmAsset(name) {
  const asset = KNOWN_NPM_QUALIFICATION.assets.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(asset, `known qualification is missing ${name}`);
  return asset;
}

function npmSourceNoopFixture() {
  return {
    jobs: [
      ...NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS.map((name) =>
        npmEvidenceJob(name),
      ),
      ...NPM_SOURCE_NOOP_REQUIRED_SKIPPED_JOBS.map((name) =>
        npmEvidenceJob(name, 'skipped'),
      ),
      ...PUBLIC_SAAS_JOBS.map((name) => npmEvidenceJob(name)),
      npmEvidenceJob(
        'Deploy hosted SaaS / Deploy hosted SaaS / Promote verified server image',
      ),
      npmEvidenceJob('Validate release and create draft'),
      npmEvidenceJob(
        'Publish Community / Self-Hosted Build Verify / Build & Boot Check (Self-Hosted)',
      ),
      npmEvidenceJob('Publish Community / Build & Push Self-Hosted Image'),
      npmEvidenceJob(
        ARTIFACT_JOB_NAME,
        'success',
        namedSteps(NPM_ARTIFACT_STEPS),
      ),
      npmEvidenceJob(NPM_PLAN_JOB_NAME, 'failure', namedSteps(NPM_PLAN_STEPS)),
    ],
    npmPlanEvidence: npmPlanEvidence(),
    releases: [
      {
        assets: KNOWN_NPM_QUALIFICATION.assets.map((asset) => ({
          created_at: asset.created_at,
          digest: asset.digest,
          id: asset.id,
          name: asset.name,
          size: asset.size,
          state: 'uploaded',
          updated_at: asset.updated_at,
        })),
        body: NPM_BODY,
        draft: true,
        id: Number(KNOWN_NPM_QUALIFICATION.draftId),
        name: NPM_TAG,
        published_at: null,
        tag_name: NPM_TAG,
        target_commitish: NPM_SHA,
      },
    ],
    remoteTagPresent: false,
    requestedRepository: 'genfeedai/genfeed.ai',
    requestedRunId: NPM_RUN_ID,
    requestedTag: NPM_TAG,
    run: {
      conclusion: 'failure',
      display_title: `Release ${NPM_TAG}`,
      event: 'workflow_dispatch',
      head_branch: 'master',
      head_repository: { full_name: 'genfeedai/genfeed.ai' },
      head_sha: NPM_SHA,
      id: Number(NPM_RUN_ID),
      path: '.github/workflows/release.yml',
      repository: { full_name: 'genfeedai/genfeed.ai' },
      status: 'completed',
    },
    sourceIsAncestor: true,
  };
}

function assertNpmSourceNoopRejects(mutate, pattern) {
  const fixture = npmSourceNoopFixture();
  mutate(fixture);
  assert.throws(() => validateReleaseRecoveryEvidence(fixture), pattern);
}

test('npm-source-noop accepts the historical master-advanced plan and frozen install assets', () => {
  assert.equal(
    NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS.includes(
      'Full Suite / CI Gate / Test API (Shard 1/4)',
    ),
    false,
  );
  assert.equal(
    NPM_SOURCE_NOOP_REQUIRED_FULL_SUITE_JOBS.includes(
      'Full Suite / CI Gate / Test API (shard 1/4)',
    ),
    true,
  );

  assert.equal(RELEASE_RECOVERY_QUALIFICATIONS.version, 2);
  assert.equal(RELEASE_RECOVERY_QUALIFICATIONS.qualifications.length, 2);
  assert.equal(
    createHash('sha256').update(readFileSync(NPM_BODY_PATH)).digest('hex'),
    ORIGINAL_RELEASE_BODY_SHA256,
  );
  assert.equal(
    KNOWN_NPM_QUALIFICATION.draftBodySha256,
    ORIGINAL_RELEASE_BODY_SHA256,
  );
  assert.equal(
    KNOWN_NPM_QUALIFICATION.imageDigest,
    'sha256:8ae47367b5f96947b7430e36999434436488c92542a7473526d327e3a070d8c5',
  );
  assert.doesNotMatch(
    recoveryEvidenceScript,
    /process\.env\.[A-Z0-9_]*(QUALIFICATION|IMAGE_DIGEST)/,
  );
  assert.match(
    recoveryEvidenceScript,
    /new URL\('\.\/release-recovery-qualifications\.json', import\.meta\.url\)/,
  );
  assert.ok(
    npmSourceNoopFixture().npmPlanEvidence.log.includes(
      '\u001b[1;31m##[error]',
    ),
  );

  const changelog = knownNpmAsset('CHANGELOG.md');
  const archive = knownNpmAsset('genfeed-selfhosted.tar.gz');
  const checksum = knownNpmAsset('genfeed-selfhosted.tar.gz.sha256');
  const result = validateReleaseRecoveryEvidence(npmSourceNoopFixture());

  assert.equal(result.recoveryKind, RECOVERY_KIND_NPM_SOURCE_NOOP);
  assert.equal(result.releaseSha, NPM_SHA);
  assert.equal(result.artifactJobId, '112372924619');
  assert.equal(result.draftId, KNOWN_NPM_QUALIFICATION.draftId);
  assert.equal(result.draftTitle, NPM_TAG);
  assert.equal(result.draftBodySha256, ORIGINAL_RELEASE_BODY_SHA256);
  assert.equal(
    result.draftBodySha256,
    createHash('sha256').update(NPM_BODY).digest('hex'),
  );
  assert.equal(result.imageDigest, KNOWN_NPM_QUALIFICATION.imageDigest);
  assert.equal(result.changelogAssetId, String(changelog.id));
  assert.equal(result.changelogAssetSize, String(changelog.size));
  assert.equal(result.changelogAssetDigest, changelog.digest);
  assert.equal(result.archiveAssetId, String(archive.id));
  assert.equal(result.archiveAssetSize, String(archive.size));
  assert.equal(result.archiveAssetDigest, archive.digest);
  assert.equal(result.checksumAssetId, String(checksum.id));
  assert.equal(result.checksumAssetSize, String(checksum.size));
  assert.equal(result.checksumAssetDigest, checksum.digest);
});

test('npm-source-noop fails closed on gate, npm, promotion, and draft drift', () => {
  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find(
      (job) => job.name === 'Full Suite / Master SHA Verdict',
    ).head_sha = 'a'.repeat(40);
  }, /incomplete, failed, or wrong-SHA Full Suite jobs/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find(
      (job) => job.name === 'Full Suite / Final Connected Acceptance',
    ).conclusion = 'failure';
  }, /incomplete, failed, or wrong-SHA Full Suite jobs/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs = fixture.jobs.filter(
      (job) => job.name !== 'Full Suite / Final Connected Acceptance',
    );
  }, /exactly one Full Suite \/ Final Connected Acceptance job; found 0/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.push(npmEvidenceJob('Full Suite / CI Gate / Static Checks'));
  }, /exactly one Full Suite \/ CI Gate \/ Static Checks job; found 2/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find((job) => job.name === NPM_PLAN_JOB_NAME).head_sha =
      'b'.repeat(40);
  }, /npm-source-noop job .*Plan npm release.*not 1c228e1a/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.npmPlanEvidence.annotations.push({
      annotation_level: 'failure',
      message: 'Checked out abc, expected the pinned release SHA.',
    });
  }, /reason other than master advancing/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.npmPlanEvidence.log +=
      '\n##[error]The recovered release SHA must remain an ancestor of current master.';
  }, /error other than master advancing/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.npmPlanEvidence.log += `\n${colorPlanError(
      'Checked out abc, expected the pinned release SHA.',
    )}`;
  }, /error other than master advancing/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find(
      (job) =>
        job.name ===
        'Publish npm Packages / Preflight immutable package tarballs',
    ).conclusion = 'success';
  }, /Preflight immutable package tarballs concluded success, expected skipped/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs
      .find((job) => job.name === NPM_PLAN_JOB_NAME)
      .steps.find(
        (step) => step.name === 'Resolve packages to publish',
      ).conclusion = 'success';
  }, /Resolve packages to publish concluded success, expected skipped/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find(
      (job) => job.name === 'Promote Community release channels',
    ).conclusion = 'success';
  }, /Promote Community release channels concluded success, expected skipped/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.find(
      (job) => job.name === 'Publish GitHub release',
    ).conclusion = 'success';
  }, /Publish GitHub release concluded success, expected skipped/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.jobs.push(npmEvidenceJob('Publish npm Packages', 'skipped'));
  }, /does not match attachment-failure or npm-source-noop/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].name = 'Renamed draft';
  }, /title Renamed draft, expected v0\.2\.3/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].draft = false;
  }, /remain an unpublished draft/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].target_commitish = 'c'.repeat(40);
  }, /targets c{40}/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.push(
      uploadedAsset('notes.txt', 616010186, 12, `sha256:${'d'.repeat(64)}`),
    );
  }, /exactly the changelog and two install assets/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.pop();
  }, /exactly the changelog and two install assets/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets[2].name = 'genfeed-selfhosted.tar.gz';
  }, /duplicate genfeed-selfhosted\.tar\.gz asset/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets[1].state = 'starter';
  }, /non-empty, uploaded genfeed-selfhosted\.tar\.gz asset/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.remoteTagPresent = true;
  }, /Recovery refuses v0\.2\.3 because its Git tag already exists/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.sourceIsAncestor = false;
  }, /Historical release SHA 1c228e1a.*is no longer reachable from master/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.requestedRunId = '99999999999';
    fixture.run.id = 99999999999;
  }, /run 99999999999 has no reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.requestedRepository = 'genfeedai/other';
    fixture.run.repository.full_name = 'genfeedai/other';
    fixture.run.head_repository.full_name = 'genfeedai/other';
  }, /repository does not match the reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.requestedTag = 'v0.2.4';
    fixture.run.display_title = 'Release v0.2.4';
    fixture.releases[0].tag_name = 'v0.2.4';
    fixture.releases[0].name = 'v0.2.4';
  }, /release tag, draft title does not match the reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    const driftedSha = 'a'.repeat(40);
    fixture.run.head_sha = driftedSha;
    fixture.releases[0].target_commitish = driftedSha;
    for (const job of fixture.jobs) {
      job.head_sha = driftedSha;
    }
  }, /source SHA does not match the reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].id = Number(KNOWN_NPM_QUALIFICATION.draftId) + 1;
  }, /draft id does not match the reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].body = `${NPM_BODY} `;
  }, /draft body does not match the reviewed controller qualification/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.find(
      (asset) => asset.name === 'CHANGELOG.md',
    ).id = knownNpmAsset('CHANGELOG.md').id + 1;
  }, /CHANGELOG\.md does not match the reviewed controller qualification \(id\)/);

  assertNpmSourceNoopRejects((fixture) => {
    const archive = fixture.releases[0].assets.find(
      (asset) => asset.name === 'genfeed-selfhosted.tar.gz',
    );
    archive.size = knownNpmAsset('genfeed-selfhosted.tar.gz').size + 1;
  }, /genfeed-selfhosted\.tar\.gz does not match the reviewed controller qualification \(size\)/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.find(
      (asset) => asset.name === 'genfeed-selfhosted.tar.gz.sha256',
    ).digest = `sha256:${'e'.repeat(64)}`;
  }, /genfeed-selfhosted\.tar\.gz\.sha256 does not match the reviewed controller qualification \(digest\)/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.find(
      (asset) => asset.name === 'CHANGELOG.md',
    ).created_at = '2026-10-06T15:06:54Z';
  }, /CHANGELOG\.md does not match the reviewed controller qualification \(created_at\)/);

  assertNpmSourceNoopRejects((fixture) => {
    fixture.releases[0].assets.find(
      (asset) => asset.name === 'genfeed-selfhosted.tar.gz',
    ).updated_at = '2026-10-06T16:15:06Z';
  }, /genfeed-selfhosted\.tar\.gz does not match the reviewed controller qualification \(updated_at\)/);
});

function runNpmRecoveryCli(fixture) {
  const captured = [];
  const errors = [];
  const calls = [];
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    const result = runReleaseRecoveryCli({
      appendFileSync: (_target, text) => captured.push(text),
      env: {
        GITHUB_OUTPUT: '/tmp/release-recovery.out',
        GITHUB_REPOSITORY: fixture.requestedRepository,
        GITHUB_STEP_SUMMARY: '/tmp/release-recovery-summary.md',
        RECOVERY_RUN_ID: fixture.requestedRunId,
        REQUESTED_TAG: fixture.requestedTag,
      },
      error: (message) => errors.push(message),
      spawnSync: (command, args) => {
        calls.push({ args: [...args], command });
        const joined = args.join(' ');
        if (command === 'git') {
          return { status: 0, stderr: '', stdout: '' };
        }
        if (joined.includes('/logs')) {
          return { status: 0, stderr: '', stdout: fixture.npmPlanEvidence.log };
        }
        if (joined.includes('/annotations')) {
          return {
            status: 0,
            stderr: '',
            stdout: JSON.stringify([fixture.npmPlanEvidence.annotations]),
          };
        }
        if (joined.includes('/jobs')) {
          return {
            status: 0,
            stderr: '',
            stdout: JSON.stringify([{ jobs: fixture.jobs }]),
          };
        }
        if (joined.includes('/actions/runs/')) {
          return { status: 0, stderr: '', stdout: JSON.stringify(fixture.run) };
        }
        if (joined.includes('/releases')) {
          return {
            status: 0,
            stderr: '',
            stdout: JSON.stringify([fixture.releases]),
          };
        }
        if (joined.includes('/git/ref/tags/')) {
          return { status: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
        }
        return {
          status: 1,
          stderr: `unexpected ${command} ${joined}`,
          stdout: '',
        };
      },
    });
    return { calls, captured, errors, exitCode: process.exitCode, result };
  } finally {
    process.exitCode = previousExitCode;
  }
}

test('npm-source-noop CLI emits the reviewed image digest and rejects drift before capture', () => {
  const accepted = runNpmRecoveryCli(npmSourceNoopFixture());
  const acceptedText = accepted.captured.join('');
  assert.equal(accepted.exitCode, undefined);
  assert.equal(accepted.errors.length, 0);
  assert.equal(
    accepted.result.imageDigest,
    KNOWN_NPM_QUALIFICATION.imageDigest,
  );
  assert.match(
    acceptedText,
    new RegExp(`image_digest=${KNOWN_NPM_QUALIFICATION.imageDigest}`),
  );
  assert.match(acceptedText, /recovery_kind=npm-source-noop/);
  assert.match(acceptedText, /Historical image digest: sha256:8ae47367/);
  assert.doesNotMatch(acceptedText, /releases\/assets\//);
  assert.equal(
    recoveryEvidenceScript.split('--allow-escape-sequences').length - 1,
    1,
  );
  const escapeCalls = accepted.calls.filter((call) =>
    call.args.includes('--allow-escape-sequences'),
  );
  assert.equal(escapeCalls.length, 1);
  assert.match(
    escapeCalls[0].args.join(' '),
    /\/actions\/jobs\/112374484557\/logs$/,
  );
  assert.equal(
    accepted.calls.some((call) =>
      call.args.join(' ').includes('/releases/assets/'),
    ),
    false,
  );

  const drifted = npmSourceNoopFixture();
  drifted.releases[0].body = `${NPM_BODY} `;
  const rejected = runNpmRecoveryCli(drifted);
  assert.equal(rejected.exitCode, 1);
  assert.equal(rejected.result, null);
  assert.equal(rejected.captured.length, 0);
  assert.match(
    rejected.errors[0],
    /draft body does not match the reviewed controller qualification/,
  );
  assert.equal(
    rejected.calls.some((call) =>
      call.args.join(' ').includes('/releases/assets/'),
    ),
    false,
  );
});

test('npm-source-noop revalidates assets without rebuilding, redeploying, or publishing npm early', () => {
  const validate = jobBlock(releaseWorkflow, 'validate-release', 'release.yml');
  const verifySuite = jobBlock(releaseWorkflow, 'verify-suite', 'release.yml');
  const publishCommunity = jobBlock(
    releaseWorkflow,
    'publish-community',
    'release.yml',
  );
  const verifyAssets = jobBlock(
    releaseWorkflow,
    'verify-recovered-assets',
    'release.yml',
  );
  const deploySaas = jobBlock(releaseWorkflow, 'deploy-saas', 'release.yml');
  const publishPackages = jobBlock(
    releaseWorkflow,
    'publish-packages',
    'release.yml',
  );
  const promote = jobBlock(releaseWorkflow, 'promote-community', 'release.yml');
  const publish = jobBlock(releaseWorkflow, 'publish-release', 'release.yml');
  const packageWorkflow = readRepoFile(
    '.github/workflows/publish-packages.yml',
  );

  assert.match(
    releaseWorkflow,
    /recovery_kind: \$\{\{ steps\.release\.outputs\.recovery_kind \}\}/,
  );
  assert.match(validate, /echo "recovery_kind="/);
  assert.match(validate, /echo "recovery_kind=\$\{RECOVERY_KIND\}"/);
  assert.match(validate, /RECOVERY_ARCHIVE_ASSET_ID/);
  assert.match(validate, /npm-source-noop draft asset/);
  assert.match(
    validate,
    /Recovery draft gained a versioned install asset before bundle rebuild/,
  );
  assert.match(
    validate,
    /must contain no versioned install assets before immutable attachment/,
  );
  assert.match(validate, /\[ "\$\{RECOVERY_KIND\}" = 'attachment-failure' \]/);

  assert.match(verifySuite, /inputs\.recovery_run_id == ''/);
  assert.match(deploySaas, /inputs\.recovery_run_id == ''/);
  assert.match(publishCommunity, /recovery_kind != 'npm-source-noop'/);

  assert.match(verifyAssets, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(verifyAssets, /persist-credentials: false/);
  assert.match(verifyAssets, /git rev-parse HEAD/);
  assert.match(verifyAssets, /node scripts\/ci\/recovered-release-assets\.mjs/);
  assert.match(verifyAssets, /^ {6}contents: write$/m);
  assert.match(
    validate,
    /if \[ -z "\$\{RECOVERY_RUN_ID\}" \]; then[\s\S]*?echo "image_digest="[\s\S]*?exit 0/,
  );
  assert.match(
    validate,
    /RECOVERY_IMAGE_DIGEST: \$\{\{ steps\.source\.outputs\.image_digest \}\}/,
  );
  assert.match(validate, /echo "image_digest=\$\{RECOVERY_IMAGE_DIGEST\}"/);
  assert.match(
    validate,
    /image_digest: \$\{\{ steps\.release\.outputs\.image_digest \}\}/,
  );
  assert.match(
    recoveryEvidenceScript,
    /`image_digest=\$\{evidence\.imageDigest\}`/,
  );
  assert.match(
    verifyAssets,
    /EXPECTED_IMAGE_DIGEST: \$\{\{ needs\.validate-release\.outputs\.image_digest \}\}/,
  );
  assert.doesNotMatch(
    promote,
    /needs\.validate-release\.outputs\.image_digest/,
  );
  assert.doesNotMatch(
    verifyAssets,
    /ref: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.doesNotMatch(verifyAssets, /packages: write/);
  assert.doesNotMatch(verifyAssets, /docker\/login-action/);
  assert.doesNotMatch(verifyAssets, /gh release upload/);
  assert.doesNotMatch(verifyAssets, /build-push-action/);
  assert.doesNotMatch(verifyAssets, /npm publish/);
  assert.doesNotMatch(verifyAssets, /deploy-saas/);

  for (const job of [publishPackages, promote, publish]) {
    assert.match(job, /needs\.publish-community\.result == 'success'/);
    assert.match(job, /needs\.verify-recovered-assets\.result == 'success'/);
    assert.match(job, /needs\.publish-community\.result == 'skipped'/);
    assert.match(job, /recovery_kind == 'npm-source-noop'/);
  }
  assert.match(promote, /needs\.publish-packages\.result == 'success'/);
  assert.match(publish, /needs\.publish-packages\.result == 'success'/);
  assert.match(publish, /needs\.promote-community\.result == 'success'/);
  assert.doesNotMatch(publishPackages, /promote-community/);
  assert.match(
    publish,
    /npm-source-noop publication is missing frozen install asset sizes/,
  );
  assert.match(
    releaseWorkflow,
    /validated_historical_recovery: \$\{\{ needs\.validate-release\.outputs\.recovery_mode == 'true' \}\}/,
  );
  assert.doesNotMatch(
    releaseWorkflow,
    /validated_historical_recovery:.*npm-source-noop/,
  );
  assert.match(
    packageWorkflow,
    /node \.release-controller\/scripts\/ci\/recovery-npm-plan-guard\.mjs/,
  );
  assert.match(
    packageWorkflow,
    /inputs\.validated_historical_recovery != true && needs\.plan\.outputs\.has_packages == 'true'/,
  );
  assert.match(
    packageWorkflow,
    /inputs\.validated_historical_recovery != true && inputs\.dry_run == false && inputs\.trusted_release_call == true && needs\.plan\.outputs\.has_packages == 'true'/,
  );
  assert.match(
    rootPackage.scripts['test:executable-contracts'],
    /scripts\/ci\/recovered-release-assets\.test\.mjs/,
  );
  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        hasPackages: 'true',
        recoveryRunId: NPM_RUN_ID,
        validatedHistoricalRecovery: 'true',
      }),
    /cannot publish pending npm packages/i,
  );
});

// Sanitized actual job/step/source shape of Release 37777911197. This fixture
// is independent of the required-job profile so missing gates cannot self-pass.
const CURRENT_NPM_JOB_RECEIPTS = [
  [113313358906, 'Validate release and create draft', 'success'],
  [
    113314499482,
    'Full Suite / Build & Boot Check / Server Bundle Boot Check',
    'success',
  ],
  [
    113314499609,
    'Full Suite / E2E Suite / Serial Runtime Acceptance',
    'success',
  ],
  [113314499629, 'Full Suite / E2E Suite / Isolated Publish E2E', 'success'],
  [113314499686, 'Full Suite / E2E Suite / API E2E Full', 'success'],
  [
    113314499704,
    'Full Suite / Connected Visual Acceptance / Actual runsc rendering and isolation',
    'success',
  ],
  [113314499739, 'Full Suite / CI Gate / Plan', 'success'],
  [113314499744, 'Full Suite / E2E Suite / API E2E Tests', 'success'],
  [
    113314499753,
    'Full Suite / E2E Suite / E2E Route Reference Inventory',
    'success',
  ],
  [
    113314499819,
    'Full Suite / E2E Suite / BRAND Receipt and Relocation Acceptance',
    'success',
  ],
  [
    113314499837,
    'Full Suite / E2E Suite / Frontend E2E (Shard 3/4)',
    'success',
  ],
  [
    113314499859,
    'Full Suite / E2E Suite / Frontend Authed E2E (real Better Auth)',
    'success',
  ],
  [
    113314499866,
    'Full Suite / E2E Suite / Frontend E2E (Shard 1/4)',
    'success',
  ],
  [
    113314499922,
    'Full Suite / E2E Suite / Frontend E2E (Shard 2/4)',
    'success',
  ],
  [
    113314499927,
    'Full Suite / E2E Suite / Frontend E2E (Shard 4/4)',
    'success',
  ],
  [
    113314499976,
    'Full Suite / E2E Suite / Proactive Production Turn Acceptance',
    'success',
  ],
  [
    113314500813,
    'Full Suite / Build & Boot Check / Server Image / Resolve server image inputs',
    'success',
  ],
  [113314631680, 'Full Suite / CI Gate / Static Checks', 'success'],
  [113314631830, 'Full Suite / CI Gate / Spec Typecheck (pool-1)', 'success'],
  [113314631875, 'Full Suite / CI Gate / Test App (shard 4/4)', 'success'],
  [113314631891, 'Full Suite / CI Gate / Spec Typecheck (pool-2)', 'success'],
  [113314631930, 'Full Suite / CI Gate / Test App (shard 1/4)', 'success'],
  [113314631932, 'Full Suite / CI Gate / Test App (shard 2/4)', 'success'],
  [113314631941, 'Full Suite / CI Gate / Cloud Tenant Guard Sweep', 'success'],
  [113314631961, 'Full Suite / CI Gate / Spec Typecheck (pool-3)', 'success'],
  [
    113314632012,
    'Full Suite / CI Gate / Test Workspaces (packages-1/4)',
    'success',
  ],
  [113314632030, 'Full Suite / CI Gate / Build', 'success'],
  [113314632041, 'Full Suite / CI Gate / Test API (shard 4/4)', 'success'],
  [
    113314632066,
    'Full Suite / CI Gate / Test Workspaces (packages-4/4)',
    'success',
  ],
  [113314632071, 'Full Suite / CI Gate / Test Workspaces (server)', 'success'],
  [113314632113, 'Full Suite / CI Gate / Test App (shard 3/4)', 'success'],
  [
    113314632116,
    'Full Suite / CI Gate / Test Workspaces (packages-2/4)',
    'success',
  ],
  [
    113314632119,
    'Full Suite / CI Gate / Test Workspaces (packages-3/4)',
    'success',
  ],
  [113314632125, 'Full Suite / CI Gate / Test API (shard 2/4)', 'success'],
  [
    113314632141,
    'Full Suite / CI Gate / Test Workspaces (browser-extension)',
    'success',
  ],
  [113314632143, 'Full Suite / CI Gate / Test API (shard 3/4)', 'success'],
  [113314632197, 'Full Suite / CI Gate / Test API (shard 1/4)', 'success'],
  [113314632216, 'Full Suite / CI Gate / Test Workspaces (web)', 'success'],
  [
    113314632783,
    'Full Suite / Build & Boot Check / Server Image / Build & Push Server Image',
    'success',
  ],
  [
    113314633862,
    `Full Suite / CI Gate / Setup Benchmark (\${{ matrix.mode }})`,
    'skipped',
  ],
  [
    113315162400,
    'Full Suite / Connected Visual Acceptance / Connected runsc rendering and Library acceptance',
    'success',
  ],
  [113317176570, 'Full Suite / E2E Suite / Merge E2E Reports', 'success'],
  [113320322688, 'Full Suite / E2E Suite / E2E Gate (all shards)', 'success'],
  [113320322709, 'Full Suite / E2E Suite / API E2E Full Gate', 'success'],
  [
    113320371321,
    'Full Suite / E2E Suite / Record nightly E2E recovery',
    'skipped',
  ],
  [
    113320371793,
    'Full Suite / E2E Suite / Report nightly E2E failure',
    'skipped',
  ],
  [
    113321194885,
    'Full Suite / Build & Boot Check / Build & Boot Check',
    'success',
  ],
  [113323867365, 'Full Suite / CI Gate / Tests Gate', 'skipped'],
  [113323869947, 'Full Suite / Final Connected Acceptance', 'success'],
  [113323870335, 'Full Suite / CI Gate / Master CI failure tracker', 'skipped'],
  [113323916812, 'Full Suite / Master SHA Verdict', 'success'],
  [113323975538, 'Deploy hosted SaaS / Validate public source', 'success'],
  [
    113323975762,
    'Publish Community / Self-Hosted Build Verify / Build & Boot Check (Self-Hosted)',
    'success',
  ],
  [113323976666, 'Verify recovered release assets', 'skipped'],
  [
    113324053337,
    'Deploy hosted SaaS / Deploy hosted SaaS / Deploy ECS',
    'success',
  ],
  [
    113331536896,
    'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy docs',
    'success',
  ],
  [
    113331536923,
    'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy app',
    'success',
  ],
  [
    113331537201,
    'Deploy hosted SaaS / Deploy hosted SaaS / Deploy Vercel frontends / Deploy web',
    'success',
  ],
  [
    113333699899,
    'Publish Community / Build & Push Self-Hosted Image',
    'success',
  ],
  [
    113333903101,
    'Deploy hosted SaaS / Deploy hosted SaaS / Post-deploy smoke',
    'success',
  ],
  [
    113333982666,
    'Deploy hosted SaaS / Deploy hosted SaaS / Promote verified server image',
    'success',
  ],
  [
    113333984989,
    'Deploy hosted SaaS / Deploy hosted SaaS / Report post-deploy smoke failure',
    'skipped',
  ],
  [
    113339037923,
    'Publish Community / Publish & Smoke Public Install Artifact',
    'success',
  ],
  [
    113340266134,
    'Publish npm Packages / Plan npm release from registry drift',
    'failure',
  ],
  [
    113340405795,
    'Publish npm Packages / Preflight immutable package tarballs',
    'skipped',
  ],
  [
    113340419892,
    'Publish npm Packages / Publish preflighted package tarballs',
    'skipped',
  ],
  [113340442907, 'Promote Community release channels', 'skipped'],
  [113340445545, 'Publish GitHub release', 'skipped'],
];
const CURRENT_NPM_BODY =
  '\n## [0.2.5](https://github.com/genfeedai/genfeed.ai/releases/tag/v0.2.5) - 2026-10-08\n\n### Features\n\n- **api:** approved-brand receipts on direct post drafts ([#6482](https://github.com/genfeedai/genfeed.ai/pull/6482))\n- guard public MCP tool references ([#6496](https://github.com/genfeedai/genfeed.ai/pull/6496))\n- **ci:** emit executable guard wall-time diagnostics ([#6502](https://github.com/genfeedai/genfeed.ai/pull/6502))\n- **heygen:** save native identities and freeze submission provenance ([#6499](https://github.com/genfeedai/genfeed.ai/pull/6499))\n- **content-learning:** gate policy activation on pilot enrollment and queue rebuilds ([#6504](https://github.com/genfeedai/genfeed.ai/pull/6504))\n\n### Fixes\n\n- **studio:** refresh Library after polled generation failure ([#6489](https://github.com/genfeedai/genfeed.ai/pull/6489))\n- **workers:** preserve unresolved HeyGen generation holds ([#6488](https://github.com/genfeedai/genfeed.ai/pull/6488))\n- harmonize Meta v26 APIs and workflow contracts ([#6487](https://github.com/genfeedai/genfeed.ai/pull/6487))\n- **ci:** build contract exports before v0.2.5 checks ([#6491](https://github.com/genfeedai/genfeed.ai/pull/6491))\n- **api:** restrict organization member mutations to managers ([#6497](https://github.com/genfeedai/genfeed.ai/pull/6497))\n- **e2e:** report authenticated Motion in its actual lane ([#6500](https://github.com/genfeedai/genfeed.ai/pull/6500))\n\n### Tests\n\n- **api:** add real-database acceptance for the branded text seam ([#6481](https://github.com/genfeedai/genfeed.ai/pull/6481))\n- **content-learning:** add hosted generation loop acceptance ([#6503](https://github.com/genfeedai/genfeed.ai/pull/6503))\n\n### Dependencies\n\n- **deps:** refresh workspace packages and Action pins ([#6498](https://github.com/genfeedai/genfeed.ai/pull/6498))\n\n';
const CURRENT_NPM_PLAN_STEPS = [
  ['Set up job', 'success'],
  ['Reject real publishes outside the release workflow', 'skipped'],
  ['Require a master ref', 'success'],
  ['Checkout the pinned commit', 'success'],
  ['Validate pinned release source', 'failure'],
  ['Setup Bun environment', 'skipped'],
  ['Validate npm release enrollment', 'skipped'],
  ['Resolve packages to publish', 'skipped'],
  ['Checkout current release controller', 'skipped'],
  ['Require an empty npm plan for historical recovery', 'skipped'],
  ['Post Checkout the pinned commit', 'success'],
  ['Complete job', 'success'],
];
const CURRENT_NPM_ARTIFACT_STEPS = [
  ['Set up job', 'success'],
  ['Checkout release source', 'success'],
  ['Setup create package', 'success'],
  ['Test and build create package', 'success'],
  ['Build version-pinned release bundle', 'success'],
  ['Smoke create against the release bundle', 'success'],
  ['Anonymous exact-image pull and metadata check', 'success'],
  ['Refuse pre-existing versioned install assets', 'skipped'],
  ['Attach install bundle to draft GitHub release', 'success'],
  ['Verify immutable install asset identities', 'success'],
  ['Post Setup create package', 'success'],
  ['Post Checkout release source', 'success'],
  ['Complete job', 'success'],
];
const CURRENT_NPM_ERROR_LOG =
  '2026-10-08T13:37:57.8885987Z ##[error]Master advanced after this release was dispatched. Run a new release from current master.\n2026-10-08T13:37:57.8895215Z ##[error]Process completed with exit code 1.';
function currentNpmSourceNoopFixture() {
  const fixture = npmSourceNoopFixture();
  const qualification = RELEASE_RECOVERY_QUALIFICATIONS.qualifications.find(
    (record) => record.runId === '37777911197',
  );
  fixture.requestedRunId = qualification.runId;
  fixture.requestedTag = qualification.releaseTag;
  Object.assign(fixture.run, {
    id: Number(qualification.runId),
    head_sha: qualification.releaseSha,
    display_title: `Release ${qualification.releaseTag}`,
  });
  fixture.jobs = CURRENT_NPM_JOB_RECEIPTS.map(([id, name, conclusion]) => ({
    id,
    name,
    conclusion,
    status: 'completed',
    head_sha: qualification.releaseSha,
    ...(name === NPM_PLAN_JOB_NAME
      ? { steps: namedSteps(CURRENT_NPM_PLAN_STEPS) }
      : name === ARTIFACT_JOB_NAME
        ? { steps: namedSteps(CURRENT_NPM_ARTIFACT_STEPS) }
        : {}),
  }));
  fixture.npmPlanEvidence = npmPlanEvidence({ log: CURRENT_NPM_ERROR_LOG });
  fixture.releases = [
    {
      id: Number(qualification.draftId),
      tag_name: qualification.releaseTag,
      name: qualification.draftTitle,
      draft: true,
      published_at: null,
      target_commitish: qualification.releaseSha,
      body: CURRENT_NPM_BODY,
      assets: qualification.assets.map((asset) => ({
        ...asset,
        state: 'uploaded',
      })),
    },
  ];
  return fixture;
}

test('the exact v0.2.5 release shape qualifies all current matrix, connected, hosted and install gates', () => {
  const fixture = currentNpmSourceNoopFixture();
  const result = validateReleaseRecoveryEvidence(fixture);
  assert.equal(result.releaseSha, 'beecff825d5ec220aa6ce949db187faeea2e1a36');
  assert.equal(result.draftId, '406811369');
  assert.equal(
    result.imageDigest,
    'sha256:9733e994b0e0741615d90b954669cce1a06a4d70839396f4e42a16eb1cc67c05',
  );
  assert.equal(result.artifactJobId, '113339037923');
  assert.equal(
    createHash('sha256').update(CURRENT_NPM_BODY).digest('hex'),
    result.draftBodySha256,
  );
});

test('every current mandatory gate rejects missing, red, skipped or duplicate evidence', () => {
  for (const name of [
    ...NPM_SOURCE_NOOP_CURRENT_FULL_SUITE_JOBS,
    ...PUBLIC_SAAS_JOBS,
    'Deploy hosted SaaS / Deploy hosted SaaS / Promote verified server image',
  ]) {
    for (const mutation of ['missing', 'failure', 'skipped', 'duplicate']) {
      const fixture = currentNpmSourceNoopFixture();
      const job = fixture.jobs.find((candidate) => candidate.name === name);
      assert.ok(job, `actual receipt missing ${name}`);
      if (mutation === 'missing')
        fixture.jobs = fixture.jobs.filter((candidate) => candidate !== job);
      else if (mutation === 'duplicate') fixture.jobs.push({ ...job });
      else job.conclusion = mutation;
      assert.throws(
        () => validateReleaseRecoveryEvidence(fixture),
        /requires exactly one|expected success|incomplete, failed, or wrong-SHA/,
      );
    }
  }
});

test('current qualification rejects source, unfinished job, npm failure and draft/asset drift', () => {
  const mutations = [
    (fixture) => {
      fixture.jobs[0].head_sha = 'a'.repeat(40);
    },
    (fixture) => {
      fixture.jobs[0].status = 'in_progress';
    },
    (fixture) => {
      fixture.jobs[0].conclusion = 'failure';
    },
    (fixture) => {
      fixture.npmPlanEvidence = npmPlanEvidence({
        log: '##[error]package publication failed',
      });
    },
    (fixture) => {
      fixture.jobs.find((job) =>
        job.name.includes('Preflight immutable'),
      ).conclusion = 'success';
    },
    (fixture) => {
      fixture.run.head_sha = 'a'.repeat(40);
      fixture.sourceIsAncestor = false;
    },
    (fixture) => {
      fixture.remoteTagPresent = true;
    },
    (fixture) => {
      fixture.releases[0].draft = false;
    },
    (fixture) => {
      fixture.releases[0].body += 'changed';
    },
    (fixture) => {
      fixture.releases[0].assets[0].updated_at = '2026-10-08T13:37:31Z';
    },
    (fixture) => {
      fixture.releases[0].assets[0].id++;
    },
    (fixture) => {
      fixture.releases[0].assets[0].size++;
    },
    (fixture) => {
      fixture.releases[0].assets[0].digest = `sha256:${'a'.repeat(64)}`;
    },
  ];
  for (const mutate of mutations) {
    const fixture = currentNpmSourceNoopFixture();
    mutate(fixture);
    assert.throws(() => validateReleaseRecoveryEvidence(fixture));
  }
  assert.throws(
    () =>
      validateRecoveryNpmPlan({
        hasPackages: 'true',
        recoveryRunId: '37777911197',
        validatedHistoricalRecovery: 'true',
      }),
    /cannot publish pending npm packages/,
  );
});

test('qualification schema rejects unknown, missing, empty or duplicate identities and profiles', () => {
  for (const profile of ['', 'unknown', null, ['ci-packages-sharded-v1']]) {
    const table = structuredClone(RELEASE_RECOVERY_QUALIFICATIONS);
    table.qualifications[1].jobProfile = profile;
    assert.throws(() => loadReleaseRecoveryQualifications(table), /invalid/);
  }
  for (const mutate of [
    (table) => {
      delete table.qualifications[1].jobProfile;
    },
    (table) => {
      table.qualifications[1].jobProfiles = [
        'ci-packages-sharded-v1',
        'ci-packages-sharded-v1',
      ];
    },
    (table) => {
      table.qualifications.push(structuredClone(table.qualifications[1]));
    },
    (table) => {
      table.qualifications[1].assets.push(
        structuredClone(table.qualifications[1].assets[0]),
      );
    },
    (table) => {
      table.qualifications[1].assets[1].name =
        table.qualifications[1].assets[0].name;
    },
    (table) => {
      delete table.qualifications[1].assets[0].digest;
    },
    (table) => {
      table.qualifications[1].assets[0].extra = true;
    },
    (table) => {
      table.jobProfiles = [];
    },
    (table) => {
      table.version = 1;
    },
  ]) {
    const table = structuredClone(RELEASE_RECOVERY_QUALIFICATIONS);
    mutate(table);
    assert.throws(() => loadReleaseRecoveryQualifications(table), /invalid/);
  }
});
