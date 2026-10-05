import {
  LIBRARY_TAG_LIST_LIMIT,
  TagsService,
} from '@api/collections/tags/services/tags.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TagScope } from '@genfeedai/contracts';
import { pickTagColor } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';

describe('TagsService', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const otherBrandId = testId('brand', 2);
  const userId = testId('user');

  const prisma = {
    tag: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  let service: TagsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TagsService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  describe('listLibraryTags', () => {
    const row = (overrides: Record<string, unknown>) => ({
      _count: { ingredients: 0 },
      backgroundColor: '#000000',
      brandId: null,
      id: testId('tag'),
      label: 'Tag',
      organizationId,
      textColor: '#ffffff',
      userId,
      ...overrides,
    });

    it('lists the brand tags, organization-wide tags and legacy defaults only', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.listLibraryTags({ brandId, organizationId });

      const args = prisma.tag.findMany.mock.calls[0]?.[0];
      expect(args.where.isDeleted).toBe(false);
      expect(args.where.OR).toEqual([
        { brandId: null, organizationId },
        { brandId: { in: [brandId] }, organizationId },
        { brandId: null, organizationId: null, userId: null },
      ]);
      expect(args.take).toBe(LIBRARY_TAG_LIST_LIMIT);
      // Another brand's id never appears anywhere in the query.
      expect(JSON.stringify(args)).not.toContain(otherBrandId);
    });

    it('counts only this brand’s live assets per tag', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.listLibraryTags({ brandId, organizationId });

      expect(
        prisma.tag.findMany.mock.calls[0]?.[0].select._count.select.ingredients
          .where,
      ).toEqual({ brandId, isDeleted: false, organizationId });
    });

    it('offers only organization-wide and default tags without a brand', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.listLibraryTags({ brandId: null, organizationId });

      expect(prisma.tag.findMany.mock.calls[0]?.[0].where.OR[1]).toEqual({
        brandId: { in: [] },
        organizationId,
      });
    });

    it('derives each tag’s scope and exposes its asset count', async () => {
      const brandTag = row({ _count: { ingredients: 14 }, brandId });
      const orgTag = row({ id: testId('tag', 2) });
      const defaultTag = row({
        id: testId('tag', 3),
        organizationId: null,
        userId: null,
      });
      prisma.tag.findMany.mockResolvedValue([brandTag, orgTag, defaultTag]);

      const docs = await service.listLibraryTags({ brandId, organizationId });

      expect(docs.map((doc) => [doc.scope, doc.assetCount])).toEqual([
        [TagScope.BRAND, 14],
        [TagScope.ORGANIZATION, 0],
        [TagScope.GLOBAL, 0],
      ]);
      expect(docs[0]).not.toHaveProperty('_count');
    });

    it('searches labels case-insensitively', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      await service.listLibraryTags({ brandId, organizationId }, 's1e');

      expect(prisma.tag.findMany.mock.calls[0]?.[0].where.label).toEqual({
        contains: 's1e',
        mode: 'insensitive',
      });
    });
  });

  describe('findByLabelInScope', () => {
    it('matches the label case-insensitively inside exactly one scope', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await service.findByLabelInScope({
        brandId: null,
        label: 'Launch',
        organizationId,
      });

      expect(prisma.tag.findFirst.mock.calls[0]?.[0].where).toEqual({
        brandId: null,
        isDeleted: false,
        label: { equals: 'Launch', mode: 'insensitive' },
        organizationId,
      });
    });

    it('returns null when nothing matches', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(
        service.findByLabelInScope({ brandId, label: 'x', organizationId }),
      ).resolves.toBeNull();
    });
  });

  describe('createInScope', () => {
    it('writes the owner columns it was given, with a null brand for organization-wide', async () => {
      prisma.tag.create.mockResolvedValue({ id: testId('tag') });

      await service.createInScope({
        brandId: null,
        label: 'Launch',
        organizationId,
        userId,
      });

      expect(prisma.tag.create.mock.calls[0]?.[0].data).toMatchObject({
        brandId: null,
        label: 'Launch',
        organizationId,
        userId,
      });
    });

    it('gives a tag created without a color its palette swatch', async () => {
      prisma.tag.create.mockResolvedValue({ id: testId('tag') });

      await service.createInScope({
        brandId: null,
        label: 'Launch',
        organizationId,
        userId,
      });

      const swatch = pickTagColor('Launch');
      expect(prisma.tag.create.mock.calls[0]?.[0].data).toMatchObject({
        backgroundColor: swatch.backgroundColor,
        textColor: swatch.textColor,
      });
    });

    it('keeps the colors its creator picked', async () => {
      prisma.tag.create.mockResolvedValue({ id: testId('tag') });

      await service.createInScope({
        backgroundColor: '#123456',
        brandId: null,
        label: 'Launch',
        organizationId,
        textColor: '#FFFFFF',
        userId,
      });

      expect(prisma.tag.create.mock.calls[0]?.[0].data).toMatchObject({
        backgroundColor: '#123456',
        textColor: '#FFFFFF',
      });
    });
  });

  describe('removeDetachingAssets', () => {
    it('soft deletes the tag and detaches it from every asset, never deleting assets', async () => {
      const tagId = testId('tag');
      prisma.tag.update.mockResolvedValue({ id: tagId, isDeleted: true });

      await service.removeDetachingAssets(tagId, organizationId);

      expect(prisma.tag.update).toHaveBeenCalledWith({
        data: { ingredients: { set: [] }, isDeleted: true },
        where: { id: tagId, isDeleted: false, organizationId },
      });
    });
  });
});
