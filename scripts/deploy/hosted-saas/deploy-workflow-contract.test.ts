import { describe, expect, test } from 'bun:test';

const workflow = (name: string): Promise<string> =>
  Bun.file(`../../../.github/workflows/${name}`).text();

describe('hosted SaaS marketplace deployment contract', () => {
  test('validates and carries an immutable marketplace SHA through the private handoff', async () => {
    const entrypoint = await workflow('deploy-hosted-saas.yml');
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(entrypoint).toContain('workflow_call:');
    expect(entrypoint).toContain('marketplace_source_sha:');
    expect(entrypoint).toContain(
      'https://github.com/genfeedai/marketplace.genfeed.ai.git',
    );
    expect(entrypoint).toContain(
      'marketplace_source_sha: $' + '{{ inputs.marketplace_source_sha }}',
    );
    expect(core).toContain(
      'marketplace_source_sha: $' + '{{ inputs.marketplace_source_sha }}',
    );
    expect(vercel).toContain('repository: genfeedai/marketplace.genfeed.ai');
    expect(vercel).toContain(
      'source_sha: $' + '{{ inputs.marketplace_source_sha }}',
    );
  });

  test('deploys and smokes the exact marketplace Vercel project', async () => {
    const core = await workflow('_deploy-hosted-saas-core.yml');
    const vercel = await workflow('_deploy-hosted-saas-vercel.yml');

    expect(vercel).toContain('label: marketplace.genfeed.ai');
    expect(vercel).toContain('project_id: prj_Ai18wq7yeWFy02jLGu0ulq1pfexS');
    expect(vercel).toContain('repository: $' + '{{ matrix.repository }}');
    expect(vercel).toContain('ref: $' + '{{ matrix.source_sha }}');
    expect(core).toContain(
      'smoke_url marketplace-home "https://marketplace.genfeed.ai"',
    );
  });
});
