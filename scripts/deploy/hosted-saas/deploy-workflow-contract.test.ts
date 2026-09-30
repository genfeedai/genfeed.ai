import { describe, expect, test } from 'bun:test';

const workflow = (name: string): Promise<string> =>
  Bun.file(`../../../.github/workflows/${name}`).text();
const turboConfig = (): Promise<string> =>
  Bun.file('../../../turbo.json').text();

describe('hosted SaaS Vercel deployment contract', () => {
  test('selects Marketplace only when an immutable source commit is supplied', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(vercel).toContain('inputs.marketplace_source_sha !=');
    expect(vercel).toContain('["app", "web", "docs", "marketplace"]');
    expect(vercel).toContain('["app", "web", "docs"]');
    expect(vercel).toContain('genfeedai/marketplace.genfeed.ai');
    expect(vercel).toContain('vars.VERCEL_PROJECT_MARKETPLACE');
    expect(vercel).toContain('secrets.MARKETPLACE_DEPLOY_TOKEN');
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

  test('gates the selected Marketplace frontend on its isolated API release', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const api = await workflow('_deploy-marketplace-api.yml');
    expect(core).toContain('needs: [deploy, deploy-marketplace-api]');
    expect(core).toContain("needs.deploy-marketplace-api.result == 'success'");
    expect(api).toContain(`ref: \${{ inputs.source_sha }}`);
    expect(api).toContain(`ref: \${{ inputs.marketplace_source_sha }}`);
    expect(api).toContain(`key=\${TF_STATE_KEY}.marketplace`);
    expect(api.indexOf('Require payment configuration')).toBeLessThan(
      api.indexOf('Ensure dedicated image repository'),
    );
    expect(api.indexOf('Migrate only the Marketplace database')).toBeLessThan(
      api.indexOf('Roll API after successful migration'),
    );
    expect(api.indexOf('Verify target health before DNS cutover')).toBeLessThan(
      api.indexOf('Cut over the dedicated API domain'),
    );
    expect(api).not.toContain('--with-decryption');
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
      `STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: \${{ vars.STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY }}`,
    );
    expect(vercel).toContain(
      `STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: \${{ vars.STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY }}`,
    );
    expect(vercel).toContain(
      `NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY=%s\\n`,
    );
    expect(vercel).toContain(
      `NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY=%s\\n`,
    );
    expect(vercel).toContain(
      `NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY|NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY)=/`,
    );
    expect(vercel).toContain('Production Pro checkout is not configured.');
    expect(vercel).toContain('Production Scale checkout is not configured.');
    expect(vercel).toContain(
      `printf '%s' "$STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY" | grep -Eq '^price_[A-Za-z0-9]+$'`,
    );
    expect(vercel).toContain("'^price_[A-Za-z0-9]+$'");
    expect(vercel).not.toContain(
      'echo "$STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY"',
    );
    expect(vercel).not.toContain(
      'echo "$STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY"',
    );
  });
});
