import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const releaseWorkflow = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/release.yml', import.meta.url),
  ),
  'utf8',
);
const publicDeployWorkflow = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/deploy-hosted-saas.yml', import.meta.url),
  ),
  'utf8',
);
const publicDeployCore = readFileSync(
  fileURLToPath(
    new URL(
      '../../.github/workflows/_deploy-hosted-saas-core.yml',
      import.meta.url,
    ),
  ),
  'utf8',
);
const publicDeployVercel = readFileSync(
  fileURLToPath(
    new URL(
      '../../.github/workflows/_deploy-hosted-saas-vercel.yml',
      import.meta.url,
    ),
  ),
  'utf8',
);

const ENTRY_SECRETS = [
  'VERCEL_TOKEN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'TURBO_TOKEN',
];
const ENGINE_SECRETS = [
  'VERCEL_TOKEN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'TURBO_TOKEN',
];

function jobBlock(jobId) {
  const match = releaseWorkflow.match(
    new RegExp(`^  ${jobId}:\\n((?:    .*?(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `release.yml must define the ${jobId} job`);
  return match[1];
}

function workflowCallSecrets(yaml) {
  const match = yaml.match(
    /(?:^|\n)[ \t]*workflow_call:\n(?:[ \t]+.*\n)*?[ \t]+secrets:\n((?:[ \t]+.+\n)+)/,
  );
  assert.ok(match, 'workflow_call must declare secrets');
  return [...match[1].matchAll(/^[ \t]+([A-Z][A-Z0-9_]+):/gm)].map(
    (item) => item[1],
  );
}

function jobSecretMapping(jobYaml) {
  assert.doesNotMatch(jobYaml, /secrets:\s*inherit/);
  const match = jobYaml.match(/^[ \t]*secrets:\n((?:[ \t]+.+\n)+)/m);
  assert.ok(match, 'job must map secrets explicitly');
  return [
    ...match[1].matchAll(
      /^[ \t]+([A-Z][A-Z0-9_]+):[ \t]*\$\{\{ secrets\.\1 \}\}/gm,
    ),
  ].map((item) => item[1]);
}

function reusableCallBlock(yaml, workflowPath) {
  const escaped = workflowPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = yaml.match(
    new RegExp(
      `uses: ${escaped}\\n((?:[ \\t]+.*(?:\\n|$))+?)(?=\\n  [A-Za-z]|\\n[A-Za-z]|$)`,
    ),
  );
  assert.ok(match, `workflow must call ${workflowPath}`);
  return match[1];
}

test('defaults hosted SaaS compute to the public monorepo reusable workflow', () => {
  assert.match(releaseWorkflow, /default: monorepo/);
  assert.match(releaseWorkflow, /saas_lane:/);

  const deploy = jobBlock('deploy-saas');
  assert.match(deploy, /if: \$\{\{ inputs\.saas_lane != 'operations' \}\}/);
  assert.match(
    deploy,
    /uses: \.\/\.github\/workflows\/deploy-hosted-saas\.yml/,
  );
  assert.match(
    deploy,
    /source_sha: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.deepEqual(jobSecretMapping(deploy), ENGINE_SECRETS);
  assert.doesNotMatch(deploy, /node scripts\/ci\/dispatch-hosted-saas\.mjs/);
  assert.doesNotMatch(deploy, /CONSOLE_DEPLOY_TOKEN/);
});

test('keeps the private operations dispatch as an explicit fallback lane', () => {
  const deploy = jobBlock('deploy-saas-via-operations');

  assert.match(deploy, /if: \$\{\{ inputs\.saas_lane == 'operations' \}\}/);
  assert.match(deploy, /CONSOLE_REPOSITORY: genfeedai\/console\.genfeed\.ai/);
  assert.match(deploy, /CONSOLE_WORKFLOW: deploy-hosted-saas\.yml/);
  assert.match(deploy, /GH_TOKEN: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/);
  assert.match(
    deploy,
    /RELEASE_SHA: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.match(
    deploy,
    /ref: \$\{\{ needs\.validate-release\.outputs\.release_sha \}\}/,
  );
  assert.match(deploy, /node scripts\/ci\/dispatch-hosted-saas\.mjs/);
  assert.doesNotMatch(deploy, /inputs\[release_sha\]=/);
  assert.doesNotMatch(deploy, /_deploy-ecs-core/);
});

test('fails closed while correlating and waiting for private deployment', () => {
  const deploy = jobBlock('deploy-saas-via-operations');

  assert.match(deploy, /display_title == \$title/);
  assert.match(deploy, /event == "workflow_dispatch"/);
  assert.match(deploy, /head_branch == "master"/);
  assert.match(deploy, /Ambiguous private deploy handoff/);
  assert.match(deploy, /No private deployment run matched/);
  assert.match(deploy, /Private run identity changed/);
  assert.match(deploy, /conclusion\}" != "success"/);
  assert.match(deploy, /deployment timed out after 170 minutes/);
});

test('public deploy workflow runs the in-repo engine and never calls console', () => {
  assert.match(
    publicDeployWorkflow,
    /uses: \.\/\.github\/workflows\/_deploy-hosted-saas-core\.yml/,
  );
  assert.doesNotMatch(
    publicDeployWorkflow,
    /uses: genfeedai\/console\.genfeed\.ai\//,
  );
  assert.match(
    publicDeployWorkflow,
    /Hosted SaaS deploys must run from refs\/heads\/master/,
  );
  assert.doesNotMatch(publicDeployWorkflow, /tofu apply|RDS_INSTANCE|\bprj_/);
  assert.doesNotMatch(
    publicDeployWorkflow,
    /aws-actions\/configure-aws-credentials/,
  );
  assert.doesNotMatch(publicDeployWorkflow, /VERCEL_ORG_ID|vercel build/);
  assert.match(
    readFileSync(
      fileURLToPath(
        new URL('../../infra/tofu/hosted-saas/providers.tf', import.meta.url),
      ),
      'utf8',
    ),
    /backend "s3"/,
  );
});

test('validates public source reachability and does not clone marketplace', () => {
  const dispatchScript = readFileSync(
    fileURLToPath(new URL('./dispatch-hosted-saas.mjs', import.meta.url)),
    'utf8',
  );

  assert.match(
    publicDeployWorkflow,
    /source_sha must be an exact lowercase 40-character Git commit SHA/,
  );
  assert.match(publicDeployWorkflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(
    publicDeployWorkflow,
    /git -C public-source merge-base --is-ancestor "\$\{SOURCE_SHA\}" origin\/master/,
  );
  assert.match(
    publicDeployWorkflow,
    /Marketplace is an independent repo and is not cloned or deployed from here/,
  );
  assert.doesNotMatch(publicDeployWorkflow, /git -C marketplace-source/);
  assert.doesNotMatch(
    publicDeployWorkflow,
    /https:\/\/github\.com\/genfeedai\/marketplace\.genfeed\.ai\.git/,
  );
  assert.match(
    dispatchScript,
    /compare\/\$\{marketplaceSourceSha\}\.\.\.master/,
  );
  assert.match(
    dispatchScript,
    /not reachable from \$\{marketplaceRepository\} master/,
  );
  assert.match(dispatchScript, /\/\^\[0-9a-f\]\{40\}\$\//);
});

test('maps only declared hosted SaaS secrets across each workflow boundary', () => {
  assert.deepEqual(workflowCallSecrets(publicDeployWorkflow), ENTRY_SECRETS);
  assert.deepEqual(workflowCallSecrets(publicDeployCore), ENGINE_SECRETS);
  assert.deepEqual(workflowCallSecrets(publicDeployVercel), ENGINE_SECRETS);

  assert.deepEqual(
    jobSecretMapping(
      reusableCallBlock(
        publicDeployWorkflow,
        './.github/workflows/_deploy-hosted-saas-core.yml',
      ),
    ),
    ENGINE_SECRETS,
  );
  assert.deepEqual(
    jobSecretMapping(
      reusableCallBlock(
        publicDeployCore,
        './.github/workflows/_deploy-hosted-saas-vercel.yml',
      ),
    ),
    ENGINE_SECRETS,
  );
  assert.doesNotMatch(publicDeployWorkflow, /secrets:\s*inherit/);
  assert.doesNotMatch(publicDeployCore, /secrets:\s*inherit/);
  assert.doesNotMatch(publicDeployVercel, /secrets:\s*inherit/);
});

test('in-repo engine never clones console and keeps OpenTofu off the entry workflow', () => {
  assert.doesNotMatch(
    publicDeployCore,
    /repository: genfeedai\/console\.genfeed\.ai/,
  );
  assert.doesNotMatch(
    publicDeployCore,
    /token: \$\{\{ secrets\.CONSOLE_DEPLOY_TOKEN \}\}/,
  );
  assert.match(publicDeployCore, /Checkout public deploy engine/);
  assert.match(publicDeployCore, /environment: production/);
  assert.match(publicDeployCore, /aws-actions\/configure-aws-credentials/);
  assert.match(publicDeployCore, /Login to GHCR/);
  assert.match(publicDeployCore, /registry: ghcr.io/);
  assert.match(
    publicDeployCore,
    /uses: \.\/\.github\/workflows\/_deploy-hosted-saas-vercel\.yml/,
  );
  assert.doesNotMatch(
    publicDeployCore,
    /uses: genfeedai\/console\.genfeed\.ai\//,
  );
  assert.match(publicDeployVercel, /environment: production/);
  assert.doesNotMatch(publicDeployVercel, /secrets\.CONSOLE_DEPLOY_TOKEN/);
});

test('hosted SaaS site identity comes from GitHub environment variables', () => {
  const tofuVariables = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/variables.tf', import.meta.url),
    ),
    'utf8',
  );
  const tofuIam = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/iam.tf', import.meta.url),
    ),
    'utf8',
  );
  const tofuProviders = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/providers.tf', import.meta.url),
    ),
    'utf8',
  );

  assert.match(publicDeployCore, /Require hosted SaaS site variables/);
  assert.match(
    publicDeployCore,
    /-backend-config="bucket=\$\{TF_STATE_BUCKET\}"/,
  );
  assert.match(publicDeployCore, /vars\.RDS_INSTANCE_ID/);
  assert.match(
    publicDeployCore,
    /https:\/\/api\.\$\{DOMAIN\}\/v1\/health\/ready/,
  );
  assert.doesNotMatch(publicDeployCore, /vpc-[0-9a-f]{8,}/);
  assert.doesNotMatch(publicDeployCore, /prj_[A-Za-z0-9]+/);
  assert.doesNotMatch(publicDeployCore, /genfeed-data/);
  assert.doesNotMatch(publicDeployVercel, /prj_[A-Za-z0-9]+/);
  assert.doesNotMatch(publicDeployVercel, /team_[A-Za-z0-9]+/);
  assert.match(publicDeployVercel, /vars\.VERCEL_PROJECT_APP/);
  assert.match(publicDeployVercel, /Require app and web Vercel project ids/);
  const vercelMatrix = publicDeployVercel.slice(
    publicDeployVercel.indexOf('strategy:'),
    publicDeployVercel.indexOf('env:'),
  );
  assert.doesNotMatch(vercelMatrix, /vars\.VERCEL_PROJECT_/);
  assert.match(tofuVariables, /variable "rds_instance_id"/);
  assert.doesNotMatch(tofuVariables, /default\s*=\s*"genfeed\.ai"/);
  assert.doesNotMatch(tofuVariables, /vpc-[0-9a-f]{8,}/);
  assert.doesNotMatch(tofuVariables, /genfeed-data/);
  assert.doesNotMatch(tofuIam, /cdn\.genfeed\.ai/);
  assert.match(tofuProviders, /backend "s3"/);
  assert.doesNotMatch(tofuProviders, /bucket\s*=\s*"genfeed-tfstate"/);
});

test('blocks irreversible release promotion until the selected SaaS lane succeeds', () => {
  for (const jobId of [
    'promote-community',
    'publish-packages',
    'publish-release',
  ]) {
    const block = jobBlock(jobId);
    assert.match(
      block,
      /needs:[\s\S]*deploy-saas/,
      `${jobId} must wait for deploy-saas`,
    );
    assert.match(
      block,
      /deploy-saas-via-operations/,
      `${jobId} must also depend on the operations lane job`,
    );
    assert.match(
      block,
      /needs\.deploy-saas\.result == 'success' \|\| needs\.deploy-saas-via-operations\.result == 'success'/,
      `${jobId} must promote only when one SaaS lane succeeded`,
    );
  }
});
