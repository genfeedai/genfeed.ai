import { describe, expect, test } from 'bun:test';

const workflow = (name: string): Promise<string> =>
  Bun.file(`../../../.github/workflows/${name}`).text();
const turboConfig = (): Promise<string> =>
  Bun.file('../../../turbo.json').text();

describe('hosted SaaS Vercel deployment contract', () => {
  test('deploys only this repository and its three Genfeed frontends', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const deploy = await workflow('deploy-hosted-saas.yml');
    const release = await workflow('release.yml');
    expect(vercel).toContain('label: [app, web, docs]');
    expect(vercel).toContain('FRONTEND_REPOSITORY: ${{ github.repository }}');
    for (const content of [vercel, deploy, release]) {
      expect(content).not.toContain('marketplace_source_sha');
      expect(content).not.toContain('MARKETPLACE_DEPLOY_TOKEN');
      expect(content).not.toContain('genfeedai/marketplace.genfeed.ai');
    }
    expect(vercel).toContain('Require Vercel token');
    expect(vercel).toContain('Require selected Vercel project ids');
  });

  test('resolves Vercel project ids after the production environment, not in matrix', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const matrix = vercel.slice(
      vercel.indexOf('strategy:'),
      vercel.indexOf('env:'),
    );

    expect(matrix).not.toContain('vars.VERCEL_PROJECT_');
  });

  test('gates Genfeed frontends only on the Genfeed API release', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    expect(core).toContain('    needs: [deploy, deploy-vercel-frontends]');
    expect(core).toContain(
      "if: ${{ !inputs.dry_run && needs.deploy.result == 'success' && needs.deploy-vercel-frontends.result == 'success' }}",
    );
    expect(core).not.toContain('deploy-marketplace-api');
    expect(core).not.toContain('marketplace_source_sha');
    expect(core).not.toContain('MARKETPLACE_DEPLOY_TOKEN');
  });

  test('stages frontends alongside the API and promotes them only after it is live', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const stage = await workflow('_deploy-hosted-saas-vercel.yml');
    const promote = await workflow('_deploy-hosted-saas-vercel-promote.yml');
    const stageJob = core.slice(
      core.indexOf('  deploy-vercel-frontends:'),
      core.indexOf('  promote-vercel-frontends:'),
    );

    // Staging starts with the API rollout instead of waiting for it.
    expect(stageJob).not.toContain('needs:');
    // Staging must never put the new build in front of users.
    expect(stage).toContain('vercel deploy --prebuilt --prod --skip-domain');
    expect(stage).not.toContain('vercel promote');
    expect(stage).not.toContain('serwist/sw.js');
    // Promotion reuses the staged build and serves it only after promote.
    expect(promote).toContain('vercel promote "${STAGED_URL}"');
    expect(promote).not.toContain('vercel build');
    expect(promote).not.toContain('vercel deploy');
    expect(promote).toContain('environment: production');
    // The smoke and image promotion wait for the live frontends.
    expect(core).toContain(
      'needs: [deploy, deploy-vercel-frontends, promote-vercel-frontends]',
    );
    expect(core).toContain(
      'needs: [deploy, deploy-vercel-frontends, promote-vercel-frontends, post-deploy-smoke]',
    );
  });

  test('stabilizes metadata clients before rolling authenticated Files', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const clients = core.indexOf('- name: Roll metadata clients before Files');
    const clientsWait = core.indexOf(
      '- name: Wait for metadata clients stable',
    );
    const files = core.indexOf('- name: Roll Files after metadata clients');
    const servicesWait = core.indexOf('- name: Wait for services stable');
    const redisAuth = core.indexOf('- name: Require Redis TLS and AUTH');

    expect(clients).toBeGreaterThan(-1);
    expect(clientsWait).toBeGreaterThan(clients);
    expect(files).toBeGreaterThan(clientsWait);
    expect(servicesWait).toBeGreaterThan(files);
    expect(redisAuth).toBeGreaterThan(servicesWait);
    expect(core.slice(clients, clientsWait)).toContain(
      `-exclude='module.service["files"]'`,
    );
    expect(core.slice(clients, clientsWait)).toContain(
      '-exclude=aws_elasticache_replication_group.redis',
    );
    expect(core.slice(clientsWait, files)).toContain(
      `map(select(. != "files")) | join(",")`,
    );
    expect(core.slice(clientsWait, files)).toContain('--services "$SERVICES"');
    expect(core.slice(clientsWait, files)).toContain('set -euo pipefail');
    expect(core.slice(files, servicesWait)).not.toContain(
      `-exclude='module.service["files"]'`,
    );
    expect(core.slice(files, servicesWait)).toContain(
      '-exclude=aws_elasticache_replication_group.redis',
    );
    expect(core).toContain("steps.wait-metadata-clients.outcome == 'failure'");
  });

  test('lets the Sentry build plugin see its token through turbo strict env mode', async () => {
    for (const workspace of ['web', 'marketing']) {
      const turbo = await Bun.file(
        `../../../apps/${workspace}/turbo.json`,
      ).text();
      expect(turbo).toContain('"SENTRY_AUTH_TOKEN"');
      // A hashed secret would also bust the remote cache on every rotation.
      expect(turbo).not.toMatch(/"env": \[[^\]]*SENTRY_AUTH_TOKEN/);
    }
  });

  test('routes the production app auth proxy through the public API', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const turbo = await turboConfig();

    expect(vercel).toContain(`DOMAIN: \${{ vars.DOMAIN }}`);
    expect(vercel).toContain(`awk '!/^(API_URL|NEXT_PUBLIC_GENFEED_CLOUD|`);
    expect(vercel).toContain(`printf 'API_URL=https://api.%s\\n' "$DOMAIN"`);
    expect(turbo).toContain(
      `"env": ["API_URL", "E2E_COVERAGE", "NEXT_PUBLIC_*", "NODE_ENV"]`,
    );
    expect(core).toContain(
      `app-auth-proxy|https://\${APP_HOST}/v1/auth/get-session|null`,
    );
  });

  test('fails closed unless the production app receives valid self-serve prices', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(vercel).toContain(
      `STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: \${{ vars.STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY }}`,
    );
    expect(vercel).toContain(
      `NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY=%s\\n`,
    );
    expect(vercel).toContain(
      `NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY)=/`,
    );
    expect(vercel).toContain('Production Scale checkout is not configured.');
    expect(vercel).toContain(
      `printf '%s' "$STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY" | grep -Eq '^price_[A-Za-z0-9]+$'`,
    );
    expect(vercel).toContain("'^price_[A-Za-z0-9]+$'");
    expect(vercel).not.toContain(
      'echo "$STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY"',
    );
  });
});

describe('preview frontend deployment contract', () => {
  test('never deploys to production or takes a production domain', async () => {
    const preview = await workflow('deploy-preview-frontend.yml');

    expect(preview).toContain('environment: preview');
    expect(preview).not.toContain('--prod');
    expect(preview).not.toContain('vercel promote');
    expect(preview).not.toContain('environment: production');
    // apps/web/vercel.json aliases app.genfeed.ai; the preview build drops it.
    expect(preview).toContain("jq 'del(.alias)' apps/web/vercel.json");
    // Only a preview.* host may be aliased.
    expect(preview).toContain("grep -Eq '^preview(\\.[a-z0-9-]+)+$'");
    expect(preview).toContain(
      'vercel alias set "${DEPLOY_URL}" "${PREVIEW_DOMAIN}"',
    );
  });

  test('builds against the preview API and refuses the production API', async () => {
    const preview = await workflow('deploy-preview-frontend.yml');

    expect(preview).toContain('PREVIEW_API_URL: ${{ vars.PREVIEW_API_URL }}');
    expect(preview).toContain(`printf 'API_URL=%s\\n' "\${PREVIEW_API_URL%/}"`);
    expect(preview).toContain('PREVIEW_API_URL points at the production API.');
  });

  test('passes the dispatched ref through env, never into script text', async () => {
    const preview = await workflow('deploy-preview-frontend.yml');

    expect(preview).toContain('REQUESTED_REF: ${{ inputs.ref }}');
    const interpolations = preview
      .split('\n')
      .filter((line) => line.includes('${{ inputs.'));
    expect(interpolations.length).toBeGreaterThan(0);
    for (const line of interpolations) {
      expect(line).toMatch(
        /^(run-name: |\s+[A-Z_]+: |\s+ref: |\s+SET_ALIAS: )/,
      );
    }
  });
});

describe('hosted SaaS rollback contract', () => {
  test('rolls back only through the public deploy lane, from master', async () => {
    const rollback = await workflow('rollback-hosted-saas.yml');

    expect(rollback).toContain(
      'uses: ./.github/workflows/deploy-hosted-saas.yml',
    );
    expect(rollback).toContain('Rollbacks must run from refs/heads/master');
    expect(rollback).not.toContain('allow_rollback');
    expect(rollback).not.toContain('image_tag');
    expect(rollback).not.toMatch(/tofu |aws rds|restore-db/);
  });

  test('restores a published stable release older than the latest one', async () => {
    const rollback = await workflow('rollback-hosted-saas.yml');

    expect(rollback).toContain('.draft == false and .prerelease == false');
    expect(rollback).toContain('is not a published stable release');
    expect(rollback).toContain('is already the latest stable release');
    expect(rollback).toContain('A rollback needs a reason.');
  });

  test('passes user input through env, never into the script text', async () => {
    const rollback = await workflow('rollback-hosted-saas.yml');

    expect(rollback).toContain('REQUESTED_TAG: ${{ inputs.target_tag }}');
    expect(rollback).toContain('REASON: ${{ inputs.reason }}');
    // dry_run is a boolean input and cannot carry script text.
    const interpolations = rollback
      .split('\n')
      .filter(
        (line) =>
          line.includes('${{ inputs.') &&
          /inputs\.(target_tag|reason)/.test(line),
      );
    expect(interpolations.length).toBeGreaterThan(0);
    for (const line of interpolations) {
      expect(line).toMatch(/^(run-name: |\s+[A-Z_]+: )/);
    }
  });

  test('smokes the MCP wire contract after every deploy', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');

    expect(core).toContain('hosted-saas/mcp-smoke.mjs');
    expect(core).toContain('--mcp-url "https://mcp.${DOMAIN}/mcp"');
  });

  test('signs in as the canary account after every deploy, with no identity in the repo', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const smokeJob = core.slice(
      core.indexOf('  post-deploy-smoke:'),
      core.indexOf('  report-post-deploy-smoke-failure:'),
    );

    expect(smokeJob).toContain('environment: production');
    expect(smokeJob).toContain('hosted-saas/signed-in-smoke.mjs');
    expect(smokeJob).toContain(
      'CANARY_EMAIL: ${{ secrets.POST_DEPLOY_CANARY_EMAIL }}',
    );
    expect(smokeJob).toContain(
      'CANARY_PASSWORD: ${{ secrets.POST_DEPLOY_CANARY_PASSWORD }}',
    );
    // A failure of the journey fails the job the failure reporter watches.
    expect(smokeJob).not.toContain('continue-on-error');
    expect(smokeJob).toContain('exit "${status}"');
  });

  test('keeps the signed-in journey read-only', async () => {
    const script = await Bun.file('./signed-in-smoke.mjs').text();
    const methods = [...script.matchAll(/method:\s*'([A-Z]+)'/g)].map(
      (match) => match[1],
    );

    // The sign-in call is the only request the journey is allowed to POST.
    expect(methods).toEqual(['POST']);
    expect(script).toContain('pathname === SIGN_IN_PATH');
    expect(script).toContain("method === 'GET' || isSignIn");
  });

  test('points a failed post-deploy smoke at the rollback workflow', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');

    expect(core).toContain('Rollback hosted SaaS');
    expect(core).toContain('docs/operations/rollback.md');
  });
});

describe('hosted SaaS on-demand seed contract', () => {
  test('runs only from master, behind the production environment and the deploy lock', async () => {
    const seed = await workflow('seed-hosted-saas.yml');

    expect(seed).toContain('Seeds must run from refs/heads/master');
    expect(seed).toContain('environment: production');
    expect(seed).toContain('group: hosted-saas-core-production');
    expect(seed).toContain('cancel-in-progress: false');
  });

  test('defaults to a dry run and never changes infrastructure', async () => {
    const seed = await workflow('seed-hosted-saas.yml');

    const liveInput = seed.match(/\n {6}live:\n((?: {8}.*\n)+)/)?.[1] ?? '';
    expect(liveInput).toContain('default: false');
    expect(seed).toContain('A live articles seed needs brand_slug');
    expect(seed).toContain('"--brandSlug=${BRAND_SLUG}"');
    expect(seed).not.toMatch(/tofu (apply|plan|destroy)/);
    expect(seed).toContain('A seed needs a reason.');
  });

  test('report seeds run fixed queries in a read-only transaction', async () => {
    const seed = await workflow('seed-hosted-saas.yml');
    const start = seed.indexOf('READ_ONLY_REPORT_SCRIPT: |');
    const reader = seed.slice(start, seed.indexOf('        run: |', start));

    expect(seed).toContain('          - backfill-report');
    expect(seed).toContain('          - webhook-id-report');
    expect(seed).toContain('          - instagram-reconnect-report');
    expect(seed).toContain(
      '            backfill-report | webhook-id-report | instagram-reconnect-report)',
    );
    expect(seed).toContain('migrate_task_definition_arn');
    expect(reader).toContain("await client.query('BEGIN READ ONLY');");
    expect(reader).toContain('FROM data_backfills');
    expect(reader).toContain("NOT LIKE 'wh\\\\_%'");
    expect(reader).toContain(
      `c."platform" = 'INSTAGRAM' AND c."isConnected" = true AND c."isDeleted" = false`,
    );
    expect(reader).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|COMMIT)\b/,
    );
  });

  test('passes user input through env, never into the script text', async () => {
    const seed = await workflow('seed-hosted-saas.yml');

    const interpolations = seed
      .split('\n')
      .filter((line) => line.includes('${{ inputs.'));
    expect(interpolations.length).toBeGreaterThan(0);
    for (const line of interpolations) {
      expect(line).toMatch(/^(run-name: |\s+name: |\s+[A-Z_]+: )/);
    }
  });
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
}
interface WorkflowJob {
  if?: string;
  steps?: WorkflowStep[];
}
interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

const parseWorkflow = async (name: string): Promise<Workflow> =>
  Bun.YAML.parse(await workflow(name)) as Workflow;

// `if: ${{ !inputs.dry_run }}` or `if: ${{ !inputs.dry_run && ... }}`. A
// top-level `||` would let its right-hand side run in a dry run; one inside
// parentheses, such as a list of step outcomes, cannot.
const isDryRunGuarded = (condition: string | undefined): boolean => {
  const text = condition ?? '';
  let topLevel = text;
  for (let previous = ''; previous !== topLevel; ) {
    previous = topLevel;
    topLevel = topLevel.replace(/\([^()]*\)/g, '');
  }
  return (
    /^\$\{\{\s*!inputs\.dry_run\s*(&&|\}\})/.test(text) &&
    !topLevel.includes('||')
  );
};

// The only steps that may run in a dry run, with why each is read-only.
const READ_ONLY_DEPLOY_STEPS = [
  'Require hosted SaaS site variables', // env checks only
  'Materialize list variables', // writes GITHUB_ENV on the runner
  'Checkout public deploy engine', // git read
  'Checkout exact public application source', // git read
  'Setup Bun (ECS poll script)', // runner tooling
  'Install ECS poll script deps (isolated)', // runner install
  'Resolve image tag', // string checks
  'Configure AWS credentials (OIDC)', // STS assume role, no resource change
  'Login to GHCR', // local docker config
  'Login to ECR', // token fetch + local docker config
  'Resolve available server image', // registry inspect
  'opentofu/setup-opentofu', // runner tooling
  'Tofu init', // backend read, no state write, no lock
] as const;

// Steps that exist only to rehearse; they must not run in a real deploy.
const DRY_RUN_ONLY_DEPLOY_STEPS = [
  'Resolve server image digest (dry run)',
  'Verify serving image schemas (dry run)',
] as const;

const WRITING_COMMAND =
  /tofu (apply|destroy)|imagetools create|prepare-server-image|ecs-run-task-and-wait|aws (rds|ecs|ssm|s3)|docker push|vercel|put-parameter|gh (issue|release|api --method)/;

describe('hosted SaaS rollback dry-run contract', () => {
  test('no writing step or job can run when dry_run is true', async () => {
    const core = await parseWorkflow('_deploy-hosted-saas-core.yml');
    const readOnly = new Set<string>(READ_ONLY_DEPLOY_STEPS);
    const dryRunOnly = new Set<string>(DRY_RUN_ONLY_DEPLOY_STEPS);
    const unclassified: string[] = [];

    for (const [jobName, job] of Object.entries(core.jobs)) {
      if (jobName !== 'deploy') {
        // Every other job writes (Vercel, issues, image promotion) or follows one.
        expect({ jobName, guarded: isDryRunGuarded(job.if) }).toEqual({
          jobName,
          guarded: true,
        });
        continue;
      }
      for (const step of job.steps ?? []) {
        const label = step.name ?? step.uses?.split('@')[0] ?? '';
        if (dryRunOnly.has(label)) {
          expect(step.if).toBe('${{ inputs.dry_run }}');
        } else if (readOnly.has(label)) {
          expect(step.if ?? '').not.toContain('inputs.dry_run');
          expect(step.run ?? '').not.toMatch(WRITING_COMMAND);
        } else if (!isDryRunGuarded(step.if)) {
          unclassified.push(label);
        }
      }
    }

    // A new step must either skip in a dry run or be listed above as read-only.
    expect(unclassified).toEqual([]);
  });

  test('keeps the read-only and dry-run-only lists in step with the workflow', async () => {
    const core = await parseWorkflow('_deploy-hosted-saas-core.yml');
    const labels = (core.jobs.deploy?.steps ?? []).map(
      (step) => step.name ?? step.uses?.split('@')[0],
    );

    for (const label of [
      ...READ_ONLY_DEPLOY_STEPS,
      ...DRY_RUN_ONLY_DEPLOY_STEPS,
    ]) {
      expect(labels).toContain(label);
    }
  });

  test('the real deploy and rollback default to dry_run false and pass it through', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const deploy = await workflow('deploy-hosted-saas.yml');
    const rollback = await workflow('rollback-hosted-saas.yml');
    const release = await parseWorkflow('release.yml');
    const flag = /\n {6}dry_run:\n((?: {8}.*\n)+)/g;

    for (const content of [core, deploy, rollback]) {
      const inputs = [...content.matchAll(flag)];
      expect(inputs.length).toBeGreaterThan(0);
      for (const [, body] of inputs) {
        expect(body).toContain('default: false');
        expect(body).toContain('type: boolean');
      }
    }
    expect(deploy).toContain('dry_run: ${{ inputs.dry_run }}');
    expect(rollback).toContain('dry_run: ${{ inputs.dry_run }}');
    // The release deploys for real: it must not opt in to a dry run.
    expect(JSON.stringify(release.jobs['deploy-saas'])).not.toContain(
      'dry_run',
    );
  });

  test('a dry run uses its own concurrency groups so it never blocks a real deploy', async () => {
    for (const name of [
      '_deploy-hosted-saas-core.yml',
      'deploy-hosted-saas.yml',
      'rollback-hosted-saas.yml',
    ]) {
      const content = await workflow(name);
      expect(content).toMatch(
        /\n {2}group: \$\{\{ inputs\.dry_run && '[a-z-]+-dry-run' \|\| '[a-z-]+' \}\}\n/,
      );
    }
  });

  test('the release rehearses the rollback after publishing, as a dry run that cannot fail it', async () => {
    const release = await workflow('release.yml');
    const job = release.slice(release.indexOf('  rehearse-rollback:'));

    expect(job).toContain('needs: [validate-release, publish-release]');
    expect(job).toContain("needs.publish-release.result == 'success'");
    expect(job).toContain('continue-on-error: true');
    expect(job).toContain('-f dry_run=true');
    expect(job).not.toContain('dry_run=false');
    expect(job).not.toContain('target_tag');
    expect(job).toContain('## Rollback rehearsal');
    // Nothing may wait on the rehearsal, including the release publication.
    expect(
      release.slice(0, release.indexOf('  rehearse-rollback:')),
    ).not.toContain('rehearse-rollback');
  });
});
