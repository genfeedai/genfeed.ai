import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import {
  KnowledgeMemoryScope,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

function buildService(memberships: Array<{ sourceId: string }> = []) {
  const findMany = vi.fn().mockResolvedValue(memberships);
  const service = new KnowledgeSelectionService({
    knowledgeSpaceMembership: { findMany },
  } as never);
  return { findMany, service };
}

describe('KnowledgeSelectionService', () => {
  it('returns no filters for an empty selection', async () => {
    const { findMany, service } = buildService();
    await expect(
      service.resolve('org-1', 'brand-1', undefined),
    ).resolves.toBeUndefined();
    await expect(
      service.resolve('org-1', 'brand-1', {}),
    ).resolves.toBeUndefined();
    await expect(
      service.resolve('org-1', 'brand-1', { sourceIds: [], spaceIds: [] }),
    ).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('unions explicit sources with space members scoped to the tenant and brand', async () => {
    const { findMany, service } = buildService([
      { sourceId: 'from-space' },
      { sourceId: 'explicit' },
    ]);

    await expect(
      service.resolve('org-1', 'brand-1', {
        purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
        sourceIds: ['explicit'],
        spaceIds: ['space-1'],
      }),
    ).resolves.toEqual({
      knowledgePurposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      knowledgeSourceIds: ['explicit', 'from-space'],
    });
    expect(findMany).toHaveBeenCalledWith({
      select: { sourceId: true },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        spaceId: { in: ['space-1'] },
        space: {
          is: {
            isDeleted: false,
            OR: [
              { scope: KnowledgeMemoryScope.ORG, brandId: null },
              { scope: KnowledgeMemoryScope.BRAND, brandId: 'brand-1' },
            ],
          },
        },
      },
    });
  });

  it('keeps an empty source list when the selected spaces hold nothing visible', async () => {
    const { service } = buildService([]);
    await expect(
      service.resolve('org-1', undefined, { spaceIds: ['space-x'] }),
    ).resolves.toEqual({ knowledgeSourceIds: [] });
  });

  it('passes purposes alone without a source constraint', async () => {
    const { findMany, service } = buildService();
    await expect(
      service.resolve('org-1', 'brand-1', {
        purposes: [KnowledgeSourcePurpose.RESEARCH],
      }),
    ).resolves.toEqual({
      knowledgePurposes: [KnowledgeSourcePurpose.RESEARCH],
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
