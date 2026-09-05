import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  runRecoveryNpmPlanGuard,
  validateRecoveryNpmPlan,
} from './recovery-npm-plan-guard.mjs';
import { validateReleaseRecoveryEvidence } from './release-recovery-evidence.mjs';

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
    requestedSaasLane: 'monorepo',
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
});

test('validates only the selected historical hosted SaaS lane', () => {
  const fixture = releaseRecoveryFixture();
  fixture.requestedSaasLane = 'operations';
  fixture.jobs = fixture.jobs.filter(
    (job) => !PUBLIC_SAAS_JOBS.includes(job.name),
  );
  fixture.jobs.find(
    (job) => job.name === 'Deploy hosted SaaS through private operations',
  ).conclusion = 'success';
  fixture.jobs.push(recoveryJob('Deploy hosted SaaS', 'skipped'));

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
  const deployOperations = jobBlock(
    releaseWorkflow,
    'deploy-saas-via-operations',
    'release.yml',
  );
  const imageBuild = jobBlock(
    selfHostedWorkflow,
    'build-and-push',
    '_publish-selfhosted-core.yml',
  );

  assert.match(verifySuite, /inputs\.recovery_run_id == ''/);
  assert.match(deploySaas, /inputs\.recovery_run_id == ''/);
  assert.match(deployOperations, /inputs\.recovery_run_id == ''/);
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
    /IMAGE_DIGEST: \$\{\{ needs\.publish-community\.outputs\.image_digest \}\}/,
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
  // `github.event.pull_request` is absent on merge_group runs (#3143); each
  // queue entry's `gh-readonly-queue/...` ref keeps the group unique there.
  assert.match(
    prTitleWorkflow,
    /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/,
  );
  assert.match(
    prTitleWorkflow,
    /^ {2}merge_group:\n {4}types: \[checks_requested\]$/m,
    'PR Title is a required context, so it must also report on the merge queue commit',
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
