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

function jobBlock(jobId) {
  const match = releaseWorkflow.match(
    new RegExp(`^  ${jobId}:\\n((?:    .*?(?:\\n|$)|\\n)+)`, 'm'),
  );
  assert.ok(match, `release.yml must define the ${jobId} job`);
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
  assert.match(deploy, /secrets: inherit/);
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
  assert.match(
    publicDeployWorkflow,
    /marketplace\.genfeed\.ai\/commits\/master/,
  );
  assert.match(
    publicDeployWorkflow,
    /Pass marketplace_source_sha, or set CONSOLE_DEPLOY_TOKEN/,
  );
  assert.match(publicDeployWorkflow, /secrets\.CONSOLE_DEPLOY_TOKEN/);
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
