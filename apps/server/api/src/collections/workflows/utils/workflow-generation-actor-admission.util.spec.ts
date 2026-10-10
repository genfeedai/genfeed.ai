import { assertWorkflowGenerationActorAdmission } from '@api/collections/workflows/utils/workflow-generation-actor-admission.util';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const source = { organizationId: 'org', actorUserId: 'actor', apiKeyId: 'key', actorScopes: ['videos:create'], brandId: 'brand', selectedNodeIds: ['video'], workflow: { nodes: [{ id: 'video', type: 'genfeedAction', config: { actionId: 'videoGen', parameters: { brandId: 'brand' } } }] } } as WorkflowAdmissionAvailableSourceV1;
  const access = { assert: vi.fn().mockResolvedValue(undefined) };
  const prisma = { apiKey: { findFirst: vi.fn().mockResolvedValue({ scopes: ['videos:create'] }) } };
  return { source, access, prisma, run: () => assertWorkflowGenerationActorAdmission(access as unknown as BrandAccessService, source, prisma as unknown as PrismaService) };
}
describe('workflow generation actor boundary', () => {
  it('refreshes the exact actor key and destination brand grant', async () => {
    const f = fixture(); await f.run();
    expect(f.prisma.apiKey.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'key', organizationId: 'org', userId: 'actor', isRevoked: false }) }));
    expect(f.access.assert).toHaveBeenCalledWith(expect.objectContaining({ apiKeyId: 'key', userId: 'actor', organizationId: 'org' }), 'brand');
  });
  it.each(['revoked', 'reduced', 'missing-snapshot', 'newly-widened'])('denies %s before media preparation', async (kind) => {
    const f = fixture();
    if (kind === 'revoked') f.prisma.apiKey.findFirst.mockResolvedValue(null as never);
    if (kind === 'reduced') f.prisma.apiKey.findFirst.mockResolvedValue({ scopes: ['videos:read'] });
    if (kind === 'missing-snapshot' || kind === 'newly-widened') f.source.actorScopes = [];
    await expect(f.run()).rejects.toThrow('key permission');
    expect(f.access.assert).not.toHaveBeenCalled();
  });
  it('denies a lost live brand grant', async () => {
    const f = fixture(); f.access.assert.mockRejectedValue(new Error('Brand access denied'));
    await expect(f.run()).rejects.toThrow('Brand access denied');
  });
});
