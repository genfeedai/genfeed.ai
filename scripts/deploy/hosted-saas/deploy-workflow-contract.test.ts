import { describe, expect, test } from 'bun:test';

const workflow = (name: string): Promise<string> =>
  Bun.file(`../../../.github/workflows/${name}`).text();

describe('hosted SaaS marketplace deployment contract', () => {
  test('carries an immutable marketplace SHA through the public handoff', async () => {
    const entrypoint = await workflow('deploy-hosted-saas.yml');
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(entrypoint).toContain('workflow_call:');
    expect(entrypoint).toContain('marketplace_source_sha:');
    expect(core).toContain(
      'marketplace_source_sha: $' + '{{ inputs.marketplace_source_sha }}',
    );
    expect(vercel).toContain('label: [app, web, docs, marketplace]');
    expect(vercel).toContain('inputs.marketplace_source_sha');
  });

  test('resolves Vercel project ids after the production environment, not in matrix', async () => {
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const matrix = vercel.slice(
      vercel.indexOf('strategy:'),
      vercel.indexOf('env:'),
    );

    expect(matrix).not.toContain('vars.VERCEL_PROJECT_');
    expect(vercel).toContain('vars.VERCEL_PROJECT_MARKETPLACE');
    expect(vercel).toContain('Require app and web Vercel project ids');
    expect(core).toContain('MARKETPLACE_HOST');
  });
});
