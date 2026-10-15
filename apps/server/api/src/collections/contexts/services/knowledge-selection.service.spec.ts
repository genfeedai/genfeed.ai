import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import {
  KnowledgeMemoryScope,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

function buildService(memberships: Array<{ sourceId: string }> = []) {
  const findMany = vi.fn().mockResolvedValue(memberships);
  const sourceFindMany = vi.fn().mockResolvedValue([]);
  const service = new KnowledgeSelectionService(
    {
      knowledgeSpaceMembership: { findMany },
      knowledgeSource: { findMany: sourceFindMany },
    } as never,
    brandAccessFixture(),
  );
  return { findMany, sourceFindMany, service };
}

describe('KnowledgeSelectionService', () => {
  it('returns no filters for an empty selection', async () => {
    const { findMany, service } = buildService();
    await expect(
      service.resolve('org-1', 'brand-1', undefined, {
        userId: 'fixture-user',
        organizationId: 'org-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.resolve(
        'org-1',
        'brand-1',
        {},
        { userId: 'fixture-user', organizationId: 'org-1' },
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.resolve(
        'org-1',
        'brand-1',
        { sourceIds: [], spaceIds: [] },
        { userId: 'fixture-user', organizationId: 'org-1' },
      ),
    ).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('unions explicit sources with space members scoped to the tenant and brand', async () => {
    const { findMany, service } = buildService([
      { sourceId: 'from-space' },
      { sourceId: 'explicit' },
    ]);

    await expect(
      service.resolve(
        'org-1',
        'brand-1',
        {
          purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
          sourceIds: ['explicit'],
          spaceIds: ['space-1'],
        },
        { userId: 'fixture-user', organizationId: 'org-1' },
      ),
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
      service.resolve(
        'org-1',
        undefined,
        { spaceIds: ['space-x'] },
        { userId: 'fixture-user', organizationId: 'org-1' },
      ),
    ).resolves.toEqual({ knowledgeSourceIds: [] });
  });

  it('passes purposes alone without a source constraint', async () => {
    const { findMany, service } = buildService();
    await expect(
      service.resolve(
        'org-1',
        'brand-1',
        {
          purposes: [KnowledgeSourcePurpose.RESEARCH],
        },
        { userId: 'fixture-user', organizationId: 'org-1' },
      ),
    ).resolves.toEqual({
      knowledgePurposes: [KnowledgeSourcePurpose.RESEARCH],
    });
    expect(findMany).not.toHaveBeenCalled();
  });
  it('expands purposes only into live visible sources in the authorized brand and organization', async () => {
    const { service, sourceFindMany } = buildService();
    sourceFindMany.mockResolvedValue([{ id: 'source-1' }]);
    await expect(
      service.resolveBrandedSourceIds(
        'org-1',
        'brand-1',
        { purposes: [KnowledgeSourcePurpose.RESEARCH] },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).resolves.toEqual(['source-1']);
    expect(sourceFindMany).toHaveBeenCalledWith({
      select: { id: true },
      take: 257,
      orderBy: { id: 'asc' },
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        isVisible: true,
        purpose: { in: [KnowledgeSourcePurpose.RESEARCH] },
        OR: [
          { scope: KnowledgeMemoryScope.ORG, brandId: null },
          { scope: KnowledgeMemoryScope.BRAND, brandId: 'brand-1' },
        ],
      },
    });
  });
  it('intersects selected spaces and sources with purposes instead of widening the selection', async () => {
    const { service, sourceFindMany } = buildService([
      { sourceId: 'space-source' },
    ]);
    await service.resolveBrandedSourceIds(
      'org-1',
      'brand-1',
      {
        sourceIds: ['picked'],
        spaceIds: ['space-1'],
        purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      },
      { organizationId: 'org-1', userId: 'user-1' },
    );
    expect(sourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['picked', 'space-source'] },
          purpose: { in: [KnowledgeSourcePurpose.BRAND_TRUTH] },
        }),
      }),
    );
  });
  it('preserves an empty selected space rather than expanding to every source of that purpose', async () => {
    const { service, sourceFindMany } = buildService();
    await service.resolveBrandedSourceIds(
      'org-1',
      'brand-1',
      {
        spaceIds: ['empty-space'],
        purposes: [KnowledgeSourcePurpose.RESEARCH],
      },
      { organizationId: 'org-1', userId: 'user-1' },
    );
    expect(sourceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [] } }),
      }),
    );
  });
  it('refuses purpose selections that exceed the receipt source bound', async () => {
    const { service, sourceFindMany } = buildService();
    sourceFindMany.mockResolvedValue(
      Array.from({ length: 257 }, (_, i) => ({ id: `source-${i}` })),
    );
    await expect(
      service.resolveBrandedSourceIds(
        'org-1',
        'brand-1',
        { purposes: [KnowledgeSourcePurpose.RESEARCH] },
        { organizationId: 'org-1', userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
