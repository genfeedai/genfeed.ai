import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import {
  AD_AUTOMATION_WORKFLOW_TEMPLATES,
  AD_SYNC_CHILD_WORKFLOWS,
} from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

function createService() {
  const credentials = {
    findAll: vi.fn().mockResolvedValue({ docs: [] }),
    findOne: vi.fn(),
  };
  const optimizationConfigs = {
    findByOrganization: vi.fn().mockResolvedValue(null),
  };
  const service = new AdAutomationWorkflowService(
    credentials as never,
    {
      findByOrganization: vi.fn(),
      upsertBatch: vi.fn(),
    } as never,
    optimizationConfigs as never,
    {
      createBatch: vi.fn(),
      expireStale: vi.fn(),
      findExistingPending: vi.fn(),
    } as never,
    { create: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { credentials, optimizationConfigs, service };
}

describe('AdAutomationWorkflowService', () => {
  it('discovers credential references without exposing encrypted tokens', async () => {
    const { credentials, service } = createService();
    credentials.findAll.mockResolvedValue({
      docs: [
        {
          accessToken: 'encrypted-secret',
          brandId: 'brand-1',
          id: 'credential-1',
        },
      ],
    });

    const result = await service.discoverCredentials('org-1', {
      platform: CredentialPlatform.FACEBOOK,
    });

    expect(result).toEqual({
      credentials: [{ brandId: 'brand-1', credentialId: 'credential-1' }],
    });
    expect(JSON.stringify(result)).not.toContain('encrypted-secret');
  });

  it('fails closed when optimization is not enabled', async () => {
    const { service } = createService();

    await expect(service.loadOptimizationConfig('org-1')).rejects.toThrow(
      'Ad optimization is not enabled',
    );
  });

  it('uses bounded workflow fan-out and action-backed child workflows', () => {
    for (const template of AD_AUTOMATION_WORKFLOW_TEMPLATES.slice(1)) {
      const forEach = template.nodes?.find(
        (node) => node.data.config.actionId === 'workflow.for-each',
      );
      expect(forEach?.data.config.parameters).toMatchObject({
        itemInputKey: 'item',
        maxConcurrency: 2,
        mode: 'scheduled',
      });
    }
    expect(AD_SYNC_CHILD_WORKFLOWS).toHaveLength(3);
    for (const child of AD_SYNC_CHILD_WORKFLOWS) {
      expect(child.definition.nodes.map((node) => node.type)).toEqual([
        'genfeedAction',
        'genfeedAction',
        'genfeedAction',
      ]);
    }
  });
});
