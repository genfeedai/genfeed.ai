import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { assertWorkflowGenerationActorAdmission } from '@api/collections/workflows/utils/workflow-generation-actor-admission.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const source: WorkflowAdmissionAvailableSourceV1 = {
    version: 1,
    state: 'available',
    preparationVersion: 1,
    requestHash: 'a'.repeat(64),
    sourceHash: 'b'.repeat(64),
    workflowId: 'workflow',
    workflowVersionId: 'version',
    workflowVersionContentHash: `sha256:v1:${'c'.repeat(64)}`,
    trigger: { type: 'manual', platform: 'web', data: {} },
    selection: { mode: 'full', respectLocks: false },
    initialNodeOutputs: {},
    initiallyCompletedNodeIds: [],
    organizationId: 'org',
    actorUserId: 'actor',
    apiKeyId: 'key',
    actorScopes: ['videos:create'],
    brandId: 'brand',
    selectedNodeIds: ['video'],
    workflow: {
      id: 'workflow',
      versionId: 'version',
      organizationId: 'org',
      userId: 'actor',
      brandId: 'brand',
      edges: [],
      lockedNodeIds: [],
      nodes: [
        {
          id: 'video',
          label: 'Video',
          inputs: [],
          type: 'genfeedAction',
          config: { actionId: 'videoGen', parameters: { brandId: 'brand' } },
        },
      ],
    },
  };
  const access = { assert: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    apiKey: {
      findFirst: vi.fn().mockResolvedValue({ scopes: ['videos:create'] }),
    },
  };
  return {
    source,
    access,
    prisma,
    run: () =>
      assertWorkflowGenerationActorAdmission(
        access as unknown as BrandAccessService,
        source,
        prisma as unknown as PrismaService,
      ),
  };
}
describe('workflow generation actor boundary', () => {
  it('refreshes the exact actor key and destination brand grant', async () => {
    const f = fixture();
    await f.run();
    expect(f.prisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'key',
          organizationId: 'org',
          userId: 'actor',
          isRevoked: false,
        }),
      }),
    );
    expect(f.access.assert).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'key',
        userId: 'actor',
        organizationId: 'org',
      }),
      'brand',
    );
  });
  it.each(['revoked', 'reduced', 'missing-snapshot', 'newly-widened'])(
    'denies %s before media preparation',
    async (kind) => {
      const f = fixture();
      if (kind === 'revoked')
        f.prisma.apiKey.findFirst.mockResolvedValue(null as never);
      if (kind === 'reduced')
        f.prisma.apiKey.findFirst.mockResolvedValue({
          scopes: ['videos:read'],
        });
      if (kind === 'missing-snapshot' || kind === 'newly-widened')
        f.source.actorScopes = [];
      await expect(f.run()).rejects.toThrow('key permission');
      expect(f.access.assert).not.toHaveBeenCalled();
    },
  );
  it('denies a lost live brand grant', async () => {
    const f = fixture();
    f.access.assert.mockRejectedValue(new Error('Brand access denied'));
    await expect(f.run()).rejects.toThrow('Brand access denied');
  });
});
