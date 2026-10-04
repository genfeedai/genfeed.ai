import type { MembersService } from '@api/collections/members/services/members.service';
import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import type { TagsQueryDto } from '@api/collections/tags/dto/tags-query.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { MemberRole, TagScope } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

describe('TagsController', () => {
  let controller: TagsController;
  let tagsService: Record<string, ReturnType<typeof vi.fn>>;
  let membersService: { findOne: ReturnType<typeof vi.fn> };
  const request = { originalUrl: '/tags' } as Request;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const userId = testId('user');
  const orgId = testId('org');
  const brandId = testId('brand');

  const mockUser = {
    id: 'authProvider_user_123',
    brandId: brandId,
    organizationId: orgId,
    userId: userId,
  } as never;

  beforeEach(() => {
    membersService = { findOne: vi.fn() };
    tagsService = {
      create: vi.fn(),
      createInScope: vi.fn(),
      findByLabelInScope: vi.fn().mockResolvedValue(null),
      listLibraryTags: vi.fn().mockResolvedValue([]),
      removeDetachingAssets: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 1,
      }),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      supportsField: vi.fn((field: string) =>
        ['brandId', 'organizationId', 'userId'].includes(field),
      ),
    };

    controller = new TagsController(
      tagsService as unknown as TagsService,
      mockLogger as unknown as LoggerService,
      membersService as unknown as MembersService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should populate organization and brand fields (user excluded from populate)', () => {
    expect(controller.optimizedPopulateFields).toHaveLength(2);
  });

  describe('buildFindAllQuery', () => {
    it('should include global tags OR conditions', () => {
      const inputQuery = { isDeleted: false } as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toHaveProperty('orderBy');
      expect(query.where.OR).toBeDefined();
    });

    it('should filter by category when provided', () => {
      const inputQuery = {
        category: 'hashtag',
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.category).toBe('hashtag');
    });

    it('should filter by brand when provided', () => {
      const inputQuery = {
        brandId,
        isDeleted: false,
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.brandId).toBe(brandId);
    });

    it('should add search condition with AND when search is provided', () => {
      const inputQuery = {
        isDeleted: false,
        search: 'trending',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.AND).toBeDefined();
    });

    it('should not include category in search OR conditions (enum field does not support contains)', () => {
      const inputQuery = {
        isDeleted: false,
        search: 'trending',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      const andBlock = query.where.AND as Array<{
        OR: Array<Record<string, unknown>>;
      }>;
      const searchOrFields = andBlock[0].OR.map(
        (entry) => Object.keys(entry)[0],
      );
      expect(searchOrFields).not.toContain('category');
      expect(searchOrFields).toEqual(
        expect.arrayContaining(['label', 'key', 'description']),
      );
    });

    it('should use label filter when search is not provided but label is', () => {
      const inputQuery = {
        isDeleted: false,
        label: 'test',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.label).toBeDefined();
      expect(query.where.AND).toBeUndefined();
    });

    it('should prefer search over label when both are provided', () => {
      const inputQuery = {
        isDeleted: false,
        label: 'specific',
        search: 'general',
      } as unknown as TagsQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query.where.AND).toBeDefined();
      expect(query.where.label).toBeUndefined();
    });
  });

  describe('enrichCreateDto', () => {
    it('should enrich new tags with canonical ownership fields', () => {
      const dto = { key: 'my-tag', label: 'My Tag' };
      const result = controller.enrichCreateDto(dto, mockUser);

      expect(result).toMatchObject({
        brandId,
        key: 'my-tag',
        label: 'My Tag',
        organizationId: orgId,
        userId,
      });
      expect(result).not.toHaveProperty('brand');
      expect(result).not.toHaveProperty('organization');
      expect(result).not.toHaveProperty('user');
    });
  });

  describe('create', () => {
    const asRole = (role: MemberRole) =>
      membersService.findOne.mockResolvedValue({ role: { key: role } });
    const created = (overrides: Record<string, unknown> = {}) => ({
      backgroundColor: '#000000',
      brandId,
      id: testId('tag'),
      label: 'S1E12',
      organizationId: orgId,
      textColor: '#FFFFFF',
      ...overrides,
    });

    it('creates a brand tag in the active brand by default', async () => {
      tagsService.createInScope.mockResolvedValue(created());

      const response = await controller.create(request, mockUser, {
        label: '  S1E12  ',
      } as never);

      expect(tagsService.createInScope).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          label: 'S1E12',
          organizationId: orgId,
          userId,
        }),
      );
      expect(
        (response as { data: { attributes: { label: string } } }).data
          .attributes.label,
      ).toBe('S1E12');
      expect(membersService.findOne).not.toHaveBeenCalled();
    });

    it('reuses the existing tag when the label already exists in the same scope', async () => {
      const existing = created({ id: testId('tag', 9) });
      tagsService.findByLabelInScope.mockResolvedValue(existing);

      const response = await controller.create(request, mockUser, {
        label: 's1e12',
      } as never);

      expect(tagsService.findByLabelInScope).toHaveBeenCalledWith({
        brandId,
        label: 's1e12',
        organizationId: orgId,
      });
      expect(tagsService.createInScope).not.toHaveBeenCalled();
      expect((response as { data: { id: string } }).data.id).toBe(existing.id);
    });

    it('creates an organization-wide tag with no brand for an admin', async () => {
      asRole(MemberRole.ADMIN);
      tagsService.createInScope.mockResolvedValue(created({ brandId: null }));

      await controller.create(request, mockUser, {
        label: 'Launch',
        scope: TagScope.ORGANIZATION,
      } as never);

      expect(tagsService.createInScope).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: null, organizationId: orgId }),
      );
      expect(tagsService.findByLabelInScope).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: null }),
      );
    });

    it('lets an owner create an organization-wide tag', async () => {
      asRole(MemberRole.OWNER);
      tagsService.createInScope.mockResolvedValue(created({ brandId: null }));

      await expect(
        controller.create(request, mockUser, {
          label: 'Launch',
          scope: TagScope.ORGANIZATION,
        } as never),
      ).resolves.toBeDefined();
    });

    it.each([MemberRole.CREATOR, MemberRole.USER, MemberRole.ANALYTICS])(
      'refuses an organization-wide tag from a %s',
      async (role) => {
        asRole(role);

        await expect(
          controller.create(request, mockUser, {
            label: 'Launch',
            scope: TagScope.ORGANIZATION,
          } as never),
        ).rejects.toBeInstanceOf(Error);
        expect(tagsService.createInScope).not.toHaveBeenCalled();
      },
    );

    it('refuses an organization-wide tag from a non-member', async () => {
      membersService.findOne.mockResolvedValue(null);

      await expect(
        controller.create(request, mockUser, {
          label: 'Launch',
          scope: TagScope.ORGANIZATION,
        } as never),
      ).rejects.toBeInstanceOf(Error);
    });

    it('does not let an API key without the admin scope act as an admin', async () => {
      asRole(MemberRole.ADMIN);

      await expect(
        controller.create(
          request,
          { ...(mockUser as object), isApiKey: true, scopes: [] } as never,
          { label: 'Launch', scope: TagScope.ORGANIZATION } as never,
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it('needs a brand for a brand tag', async () => {
      await expect(
        controller.create(
          request,
          { ...(mockUser as object), brandId: undefined } as never,
          { label: 'Launch' } as never,
        ),
      ).rejects.toThrow('Select a brand');
    });

    it('rejects a blank label', async () => {
      await expect(
        controller.create(request, mockUser, { label: '   ' } as never),
      ).rejects.toThrow('needs a label');
    });
  });

  describe('findLibrary', () => {
    it('lists the active brand’s tags with counts, and nothing for another brand', async () => {
      tagsService.listLibraryTags.mockResolvedValue([
        {
          assetCount: 3,
          backgroundColor: '#000000',
          brandId,
          id: testId('tag'),
          label: 'S1E12',
          organizationId: orgId,
          scope: TagScope.BRAND,
          textColor: '#FFFFFF',
        },
      ]);

      const response = await controller.findLibrary(request, mockUser, {});

      expect(tagsService.listLibraryTags).toHaveBeenCalledWith(
        { brandId, organizationId: orgId },
        undefined,
      );
      const [tag] = (
        response as { data: Array<{ attributes: Record<string, unknown> }> }
      ).data;
      expect(tag?.attributes).toMatchObject({
        assetCount: 3,
        label: 'S1E12',
        scope: TagScope.BRAND,
      });
    });

    it('refuses another brand’s tag list to a member', async () => {
      await expect(
        controller.findLibrary(request, mockUser, {
          brandId: testId('brand', 2),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tagsService.listLibraryTags).not.toHaveBeenCalled();
    });

    it('lets a platform superadmin read any brand', async () => {
      const otherBrandId = testId('brand', 2);

      await controller.findLibrary(
        request,
        { ...(mockUser as object), isSuperAdmin: true } as never,
        { brandId: otherBrandId },
      );

      expect(tagsService.listLibraryTags).toHaveBeenCalledWith(
        { brandId: otherBrandId, organizationId: orgId },
        undefined,
      );
    });

    it('passes the search through', async () => {
      await controller.findLibrary(request, mockUser, { search: 'ep' });

      expect(tagsService.listLibraryTags).toHaveBeenCalledWith(
        expect.anything(),
        'ep',
      );
    });
  });

  describe('remove', () => {
    const tagId = testId('tag');
    const existing = (overrides: Record<string, unknown> = {}) => ({
      brandId,
      id: tagId,
      organizationId: orgId,
      ...overrides,
    });

    it('deletes a brand tag from its own brand, detaching it from assets', async () => {
      tagsService.findOne.mockResolvedValue(existing());
      tagsService.removeDetachingAssets.mockResolvedValue(existing());

      await controller.remove(request, mockUser, tagId);

      expect(tagsService.removeDetachingAssets).toHaveBeenCalledWith(
        tagId,
        orgId,
      );
      expect(tagsService.remove).not.toHaveBeenCalled();
    });

    it('needs an admin to delete an organization-wide tag', async () => {
      tagsService.findOne.mockResolvedValue(existing({ brandId: null }));
      membersService.findOne.mockResolvedValue({
        role: { key: MemberRole.CREATOR },
      });

      await expect(
        controller.remove(request, mockUser, tagId),
      ).rejects.toBeInstanceOf(Error);
      expect(tagsService.removeDetachingAssets).not.toHaveBeenCalled();
    });

    it('lets an admin delete an organization-wide tag', async () => {
      tagsService.findOne.mockResolvedValue(existing({ brandId: null }));
      tagsService.removeDetachingAssets.mockResolvedValue(
        existing({ brandId: null }),
      );
      membersService.findOne.mockResolvedValue({
        role: { key: MemberRole.ADMIN },
      });

      await controller.remove(request, mockUser, tagId);

      expect(tagsService.removeDetachingAssets).toHaveBeenCalled();
    });

    it('treats another brand’s tag as an admin-only change', async () => {
      tagsService.findOne.mockResolvedValue(
        existing({ brandId: testId('brand', 2) }),
      );
      membersService.findOne.mockResolvedValue({
        role: { key: MemberRole.USER },
      });

      await expect(
        controller.remove(request, mockUser, tagId),
      ).rejects.toBeInstanceOf(Error);
    });

    it('hides a tag from another organization as not found', async () => {
      tagsService.findOne.mockResolvedValue(
        existing({ organizationId: testId('org', 2) }),
      );

      await expect(
        controller.remove(request, mockUser, tagId),
      ).rejects.toBeInstanceOf(Error);
      expect(tagsService.removeDetachingAssets).not.toHaveBeenCalled();
    });

    it('keeps legacy default tags read-only', async () => {
      tagsService.findOne.mockResolvedValue(
        existing({ brandId: null, organizationId: null }),
      );

      await expect(
        controller.remove(request, mockUser, tagId),
      ).rejects.toBeInstanceOf(Error);
      expect(tagsService.removeDetachingAssets).not.toHaveBeenCalled();
    });
  });

  describe('patch permissions', () => {
    const tag = (overrides: Record<string, unknown> = {}) =>
      ({ brandId, organizationId: orgId, ...overrides }) as never;

    it('lets a member rename a tag of the active brand', async () => {
      await expect(
        controller.assertPatchAllowed(mockUser, tag(), { label: 'x' }),
      ).resolves.toBeUndefined();
    });

    it('needs an admin to recolor an organization-wide tag', async () => {
      membersService.findOne.mockResolvedValue({
        role: { key: MemberRole.CREATOR },
      });

      await expect(
        controller.assertPatchAllowed(mockUser, tag({ brandId: null }), {
          backgroundColor: '#ffffff',
        }),
      ).rejects.toBeInstanceOf(Error);

      membersService.findOne.mockResolvedValue({
        role: { key: MemberRole.OWNER },
      });
      await expect(
        controller.assertPatchAllowed(mockUser, tag({ brandId: null }), {
          backgroundColor: '#ffffff',
        }),
      ).resolves.toBeUndefined();
    });

    it('never lets a member change a legacy default tag', async () => {
      await expect(
        controller.assertPatchAllowed(
          mockUser,
          tag({ brandId: null, organizationId: null }),
          { label: 'x' },
        ),
      ).rejects.toBeInstanceOf(Error);
    });

    it('reaches only tags of the member’s own organization', () => {
      expect(controller.canUserModifyEntity(mockUser, tag())).toBe(true);
      expect(
        controller.canUserModifyEntity(
          mockUser,
          tag({ organizationId: testId('org', 2) }),
        ),
      ).toBe(false);
      expect(
        controller.canUserModifyEntity(mockUser, tag({ organizationId: null })),
      ).toBe(false);
    });
  });
});
