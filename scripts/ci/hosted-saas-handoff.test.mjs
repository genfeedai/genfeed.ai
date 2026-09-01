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
  'SENTRY_AUTH_TOKEN',
  'TURBO_TOKEN',
];
const ENGINE_SECRETS = [
  'VERCEL_TOKEN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'SENTRY_AUTH_TOKEN',
  'TURBO_TOKEN',
];

// A skipped verify-suite must only be accepted when validate-release proved the
// release SHA already carries green Full Suite evidence. A failed or
// evidence-less skip still blocks the deploy, so both lanes carry this clause
// verbatim.
const VERIFY_SUITE_ACCEPTANCE =
  /\(needs\.verify-suite\.result == 'success' \|\|\n\s+\(needs\.verify-suite\.result == 'skipped' &&\n\s+needs\.validate-release\.outputs\.suite_verified == 'true'\)\)/;

function assertDeployGate(jobYaml, laneCondition) {
  for (const condition of [
    /!cancelled\(\)/,
    /inputs\.recovery_run_id == ''/,
    laneCondition,
    /needs\.validate-release\.result == 'success'/,
    VERIFY_SUITE_ACCEPTANCE,
  ]) {
    assert.match(jobYaml, condition);
  }
}

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
  assertDeployGate(deploy, /inputs\.saas_lane != 'operations'/);
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

  assertDeployGate(deploy, /inputs\.saas_lane == 'operations'/);
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

test('hosted SaaS owns the canonical browser app origin', () => {
  const localsTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/locals.tf', import.meta.url),
    ),
    'utf8',
  );
  const servicesTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/services.tf', import.meta.url),
    ),
    'utf8',
  );
  const internalEnv = servicesTf.slice(
    servicesTf.indexOf('internal_env = ['),
    servicesTf.indexOf('module "service"'),
  );

  assert.match(
    internalEnv,
    /\{ name = "GENFEEDAI_APP_URL", value = "https:\/\/app\.\$\{var\.domain\}" \}/,
  );
  assert.match(
    localsTf,
    /reserved_env_names\s*=\s*toset\(concat\(\s*\[for e in local\.internal_env : e\.name\]/,
  );
});

test('scopes public ECS tasks to service-required secrets and IAM', () => {
  const localsTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/locals.tf', import.meta.url),
    ),
    'utf8',
  );
  const iamTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/iam.tf', import.meta.url),
    ),
    'utf8',
  );
  const servicesTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/services.tf', import.meta.url),
    ),
    'utf8',
  );

  assert.match(localsTf, /public_backend_secret_allowlist/);
  assert.match(localsTf, /public_backend_task_secrets/);
  assert.match(localsTf, /public_backend_forbidden_secret_names/);
  assert.match(servicesTf, /aws_iam_role\.public_task\.arn/);
  assert.match(servicesTf, /local\.public_backend_task_secrets\[each\.key\]/);
  assert.match(iamTf, /resource "aws_iam_role" "public_task"/);

  const allowlist = localsTf.slice(
    localsTf.indexOf('public_backend_secret_allowlist'),
    localsTf.indexOf('public_backend_task_secrets'),
  );
  for (const forbidden of [
    'DATABASE_URL',
    'DIRECT_URL',
    'TOKEN_ENCRYPTION_KEY',
    'BETTER_AUTH_SECRET',
    'AWS_SECRET_ACCESS_KEY',
    'STRIPE_SECRET_KEY',
  ]) {
    assert.doesNotMatch(
      allowlist,
      new RegExp(`"${forbidden}"`),
      `public backend allowlist must not include ${forbidden}`,
    );
  }

  const publicTask = iamTf.slice(
    iamTf.indexOf('resource "aws_iam_role" "public_task"'),
  );
  assert.doesNotMatch(publicTask, /s3:PutObject|s3:DeleteObject|CdnBucket/);
});

test('requires Redis TLS plus AUTH for shared ECS tasks', () => {
  const localsTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/locals.tf', import.meta.url),
    ),
    'utf8',
  );
  const elasticacheTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/elasticache.tf', import.meta.url),
    ),
    'utf8',
  );
  const servicesTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/services.tf', import.meta.url),
    ),
    'utf8',
  );
  const variablesTf = readFileSync(
    fileURLToPath(
      new URL('../../infra/tofu/hosted-saas/variables.tf', import.meta.url),
    ),
    'utf8',
  );

  assert.match(elasticacheTf, /transit_encryption_enabled\s+=\s+true/);
  assert.match(elasticacheTf, /transit_encryption_mode\s+=\s+"required"/);
  assert.match(
    elasticacheTf,
    /auth_token\s+=\s+random_password\.redis_auth_token\.result/,
  );
  assert.match(
    elasticacheTf,
    /auth_token_update_strategy\s+=\s+var\.redis_auth_token_update_strategy/,
  );
  assert.match(
    variablesTf,
    /variable "redis_auth_token_update_strategy"[\s\S]*default\s+=\s+"SET"/,
  );
  assert.doesNotMatch(
    elasticacheTf,
    /transit_encryption_mode\s+=\s+"preferred"/,
  );
  assert.doesNotMatch(elasticacheTf, /ignore_changes\s+=\s+\[auth_token/);
  assert.match(
    elasticacheTf,
    /data "aws_elasticache_replication_group" "current"/,
  );
  assert.match(
    elasticacheTf,
    /replication_group_id\s+=\s+"\$\{local\.name_prefix\}-redis"/,
  );
  assert.match(
    localsTf,
    /valueFrom\s+=\s+aws_ssm_parameter\.redis_password\.arn/,
  );
  assert.doesNotMatch(localsTf, /redis_task_secrets\s+=\s+\[\]/);
  assert.match(servicesTf, /REDIS_TLS", value = "true"/);
  assert.match(servicesTf, /rediss:\/\//);
  assert.match(
    servicesTf,
    /data\.aws_elasticache_replication_group\.current\.primary_endpoint_address/,
  );
  assert.doesNotMatch(
    servicesTf,
    /aws_elasticache_replication_group\.redis\.primary_endpoint_address/,
  );
  assert.match(
    publicDeployCore,
    /-exclude=aws_elasticache_replication_group\.redis/,
  );
  assert.match(publicDeployCore, /Require Redis TLS and AUTH/);
  const registerApply = publicDeployCore.slice(
    publicDeployCore.indexOf(
      'Register migration, backfill, and boot-smoke task definitions',
    ),
    publicDeployCore.indexOf('Snapshot RDS before migrations'),
  );
  const rollApply = publicDeployCore.slice(
    publicDeployCore.indexOf('Tofu apply (roll services to new image)'),
    publicDeployCore.indexOf('Wait for services stable'),
  );
  const authApply = publicDeployCore.slice(
    publicDeployCore.indexOf('Require Redis TLS and AUTH'),
    publicDeployCore.indexOf('Print active service logs on rollout failure'),
  );
  assert.match(registerApply, /-target=aws_ecs_task_definition\.migrate/);
  assert.doesNotMatch(registerApply, /-exclude=/);
  assert.match(rollApply, /-exclude=aws_elasticache_replication_group\.redis/);
  assert.doesNotMatch(rollApply, /-target=/);
  assert.match(authApply, /AuthTokenEnabled/);
  assert.match(authApply, /TF_VAR_redis_auth_token_update_strategy=ROTATE/);
  assert.match(authApply, /-target=aws_elasticache_replication_group\.redis/);
  assert.doesNotMatch(authApply, /-exclude=/);
});

test('passes deploy values through env instead of interpolating into shell or JS', () => {
  assert.match(publicDeployCore, /SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(
    publicDeployCore,
    /TF_VAR_image_tag: \$\{\{ steps\.image\.outputs\.sha \}\}/,
  );
  assert.match(
    publicDeployCore,
    /IMAGE_SHA: \$\{\{ steps\.image\.outputs\.sha \}\}/,
  );
  assert.match(publicDeployCore, /const sourceSha = process\.env\.SOURCE_SHA/);
  assert.match(
    publicDeployCore,
    /echo "Public source SHA: \\`\$\{SOURCE_SHA\}\\`"/,
  );
  assert.doesNotMatch(
    publicDeployCore,
    /Public source SHA: \\`\$\{\{ inputs\.source_sha \}\}/,
  );
  assert.doesNotMatch(publicDeployCore, /-var="image_tag=\$\{\{/);
  assert.doesNotMatch(
    publicDeployCore,
    /SHA="\$\{\{ steps\.image\.outputs\.sha \}\}"/,
  );
});

test('authenticates to the private GHCR server package before inspect or copy', () => {
  const releasing = readFileSync(
    fileURLToPath(new URL('../../RELEASING.md', import.meta.url)),
    'utf8',
  );

  assert.match(
    publicDeployCore,
    /uses: docker\/login-action@[0-9a-f]{40} # v4\.\d+\.\d+/,
  );
  assert.match(publicDeployCore, /registry: ghcr\.io/);
  assert.match(publicDeployCore, /password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(publicDeployCore, /private GHCR package/);
  assert.match(
    publicDeployCore,
    /imagetools inspect "\$\{REPO\}:\$1" >\/dev\/null\n/,
  );
  assert.doesNotMatch(
    publicDeployCore,
    /imagetools inspect "\$\{REPO\}:\$1" >\/dev\/null 2>&1/,
  );
  assert.match(
    releasing,
    /Do not change the visibility of the internal `genfeed\.ai\/server` package/,
  );
  assert.match(releasing, /authenticates to GHCR with `GITHUB_TOKEN`/);
});

test('keeps smoke retry budget consistent with the configured URL set', () => {
  const smokeJob = publicDeployCore.slice(
    publicDeployCore.indexOf('post-deploy-smoke:'),
    publicDeployCore.indexOf('report-post-deploy-smoke-failure:'),
  );
  const timeoutMinutes = Number(
    smokeJob.match(/timeout-minutes:\s+(\d+)/)?.[1],
  );
  const retry = Number(smokeJob.match(/SMOKE_RETRY:\s+"(\d+)"/)?.[1]);
  const retryDelay = Number(
    smokeJob.match(/SMOKE_RETRY_DELAY:\s+"(\d+)"/)?.[1],
  );
  const maxTime = Number(smokeJob.match(/SMOKE_MAX_TIME:\s+"(\d+)"/)?.[1]);

  assert.equal(Number.isFinite(timeoutMinutes), true);
  assert.equal(retry, 6);
  assert.equal(retryDelay, 10);
  assert.equal(maxTime, 20);
  assert.match(smokeJob, /smoke_specs=\(/);
  assert.match(smokeJob, /url_count="\$\{#smoke_specs\[@\]\}"/);
  assert.match(smokeJob, /budget_seconds=/);
  assert.match(smokeJob, /api-ready\|https:\/\/api\.\$\{DOMAIN\}/);
  assert.match(smokeJob, /mcp-health\|https:\/\/mcp\.\$\{DOMAIN\}/);
  assert.match(
    smokeJob,
    /notifications-health\|https:\/\/notifications\.\$\{DOMAIN\}/,
  );
  assert.match(smokeJob, /if \[ -n "\$\{DOCS_HOST\}" \]/);

  const requiredUrls = 5;
  const optionalDocs = 1;
  const perUrlSeconds = (retry + 1) * maxTime + retry * retryDelay;
  const maxBudgetSeconds = (requiredUrls + optionalDocs) * perUrlSeconds;
  assert.equal(perUrlSeconds, 200);
  assert.ok(
    timeoutMinutes * 60 >= maxBudgetSeconds,
    `timeout-minutes ${timeoutMinutes} must cover ${requiredUrls + optionalDocs} URLs at ${perUrlSeconds}s each`,
  );
});

test('blocks irreversible promotion until normal or recovered SaaS evidence is exact', () => {
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
      `${jobId} must promote a normal release only when one SaaS lane succeeded`,
    );
    assert.match(
      block,
      /needs\.validate-release\.outputs\.recovery_mode == 'true'[\s\S]*needs\.validate-release\.outputs\.recovery_saas_verified == 'true'[\s\S]*needs\.deploy-saas\.result == 'skipped'[\s\S]*needs\.deploy-saas-via-operations\.result == 'skipped'/,
      `${jobId} must promote a recovery only from validated historical SaaS evidence`,
    );
  }
});
