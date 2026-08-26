import { describe, expect, test } from 'bun:test';

const workflow = (name: string): Promise<string> =>
  Bun.file(`../../../.github/workflows/${name}`).text();

describe('hosted SaaS Vercel deployment contract', () => {
  test('deploys only monorepo frontends from this repository', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(vercel).toContain('label: [app, web, docs]');
    expect(vercel).not.toContain('marketplace');
    expect(vercel).not.toContain('marketplace.genfeed.ai');
    expect(vercel).toContain('Require Vercel token');
    expect(vercel).toContain('Require app and web Vercel project ids');
  });

  test('resolves Vercel project ids after the production environment, not in matrix', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const matrix = vercel.slice(
      vercel.indexOf('strategy:'),
      vercel.indexOf('env:'),
    );

    expect(matrix).not.toContain('vars.VERCEL_PROJECT_');
  });

  test('routes the production app auth proxy through the public API', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const core = await workflow('_deploy-hosted-saas-core.yml');

    expect(vercel).toContain(`DOMAIN: \${{ vars.DOMAIN }}`);
    expect(vercel).toContain(`awk '!/^(API_URL|NEXT_PUBLIC_GENFEED_CLOUD)=/'`);
    expect(vercel).toContain(`printf 'API_URL=https://api.%s\\n' "$DOMAIN"`);
    expect(core).toContain(
      `app-auth-proxy|https://\${APP_HOST}/v1/auth/get-session|null`,
    );
  });
});
