vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn(),
  serializeCollection: vi.fn((_req, _serializer, data) => ({ data })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import type { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  IngredientCategory,
  IngredientStatus,
  LibraryShelf,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

const brandId = testId('brand');
const organizationId = testId('org');
const userId = testId('user');

/** Flatten the `AND` array the controller builds so branches can be asserted. */
function andBranches(aggregate: unknown): Record<string, unknown>[] {
  const where = (aggregate as { where: { AND: Record<string, unknown>[] } })
    .where;
  return where.AND;
}

function findBranchWith(
  aggregate: unknown,
  key: string,
): Record<string, unknown> | undefined {
  return andBranches(aggregate).find((branch) => key in branch);
}

describe('IngredientsController — Library axes', () => {
  const mockUser: User = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  };
  const mockRequest = { originalUrl: '/api/ingredients', query: {} } as Request;

  const ingredientsService = {
    findAll: vi.fn().mockResolvedValue({ docs: [] }),
    findByIds: vi.fn().mockResolvedValue([]),
    getLibrarySummary: vi.fn().mockResolvedValue({
      byCategory: {},
      byShelf: {},
      starredCount: 0,
      storageBytes: 0,
      total: 0,
      trashedCount: 0,
    }),
  };

  const controller = new IngredientsController(
    ingredientsService as unknown as IngredientsService,
    {} as never,
    {} as never,
    { ingredientsEndpoint: 'https://cdn.genfeed.ai/ingredients' } as never,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('route metadata', () => {
    it('exposes the unified list on the collection root', () => {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          IngredientsController.prototype.findAll,
        ),
      ).toBe('/');
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          IngredientsController.prototype.findAll,
        ),
      ).toBe(RequestMethod.GET);
    });

    it('exposes the sidebar summary on its own path', () => {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          IngredientsController.prototype.getSummary,
        ),
      ).toBe('summary');
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          IngredientsController.prototype.getSummary,
        ),
      ).toBe(RequestMethod.GET);
    });
  });

  describe('findAll', () => {
    it('always scopes the query to the authenticated organization', async () => {
      await controller.findAll(
        mockRequest,
        {} as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(andBranches(aggregate)).toContainEqual({ organizationId });
    });

    it('rejects a member brand override outside the active context', async () => {
      await expect(
        controller.findAll(
          mockRequest,
          { brandId: testId('brand', 2) } as IngredientsQueryDto,
          mockUser,
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(ingredientsService.findAll).not.toHaveBeenCalled();
    });

    it('allows a superadmin brand override inside the tenant query', async () => {
      const otherBrandId = testId('brand', 2);

      await controller.findAll(
        mockRequest,
        { brandId: otherBrandId } as IngredientsQueryDto,
        { ...mockUser, isSuperAdmin: true },
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(andBranches(aggregate)).toContainEqual({ brandId: otherBrandId });
      expect(andBranches(aggregate)).toContainEqual({ organizationId });
    });

    it('filters the type axis on the multi-select `categories` field', async () => {
      await controller.findAll(
        mockRequest,
        {
          categories: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
        } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(findBranchWith(aggregate, 'category')).toEqual({
        category: { in: ['IMAGE', 'VIDEO'] },
      });
    });

    it('falls back to the single `category` field when no multi-select is given', async () => {
      await controller.findAll(
        mockRequest,
        { category: IngredientCategory.GIF } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(findBranchWith(aggregate, 'category')).toEqual({
        category: 'GIF',
      });
    });

    it('lets the shelf own the status axis so Archived is not ANDed away', async () => {
      await controller.findAll(
        mockRequest,
        { shelf: LibraryShelf.ARCHIVED } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      const statusBranches = andBranches(aggregate).filter(
        (branch) => 'status' in branch,
      );
      expect(statusBranches).toEqual([
        {
          status: {
            in: [IngredientStatus.ARCHIVED, IngredientStatus.REJECTED],
          },
        },
      ]);
    });

    it('applies the default status window when no shelf is selected', async () => {
      await controller.findAll(
        mockRequest,
        {} as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      const status = findBranchWith(aggregate, 'status') as {
        status: { in: IngredientStatus[] };
      };
      expect(status.status.in).toContain(IngredientStatus.GENERATED);
      expect(status.status.in).not.toContain(IngredientStatus.ARCHIVED);
    });

    it('composes the folder axis alongside shelf and type', async () => {
      const folderId = testId('folder');
      await controller.findAll(
        mockRequest,
        {
          categories: [IngredientCategory.IMAGE],
          folderId,
          shelf: LibraryShelf.GENERATING,
        } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(findBranchWith(aggregate, 'category')).toEqual({
        category: { in: ['IMAGE'] },
      });
      expect(findBranchWith(aggregate, 'status')).toEqual({
        status: IngredientStatus.PROCESSING,
      });
      expect(findBranchWith(aggregate, 'folderId')).toBeDefined();
    });

    it('keeps `isDeleted` at the top level so the Trash place is reachable', async () => {
      await controller.findAll(
        mockRequest,
        { isDeleted: true } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      const where = (aggregate as { where: Record<string, unknown> }).where;
      expect(where.isDeleted).toBe(true);
      expect(
        andBranches(aggregate).some((branch) => 'isDeleted' in branch),
      ).toBe(false);
    });

    it('narrows to starred assets for the Starred place', async () => {
      await controller.findAll(
        mockRequest,
        { isFavorite: true } as IngredientsQueryDto,
        mockUser,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0];
      expect(andBranches(aggregate)).toContainEqual({ isFavorite: true });
    });
  });

  describe('getSummary', () => {
    it("delegates with the caller's organization and brand scope", async () => {
      await controller.getSummary(
        mockRequest,
        {} as IngredientsQueryDto,
        mockUser,
      );

      expect(ingredientsService.getLibrarySummary).toHaveBeenCalledWith(
        organizationId,
        { brandId },
      );
    });

    it('rejects an explicit foreign-brand override for a member', async () => {
      const otherBrandId = testId('brand', 2);

      await expect(
        controller.getSummary(
          mockRequest,
          { brandId: otherBrandId } as IngredientsQueryDto,
          mockUser,
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(ingredientsService.getLibrarySummary).not.toHaveBeenCalled();
    });

    it('allows a superadmin explicit brand override', async () => {
      const otherBrandId = testId('brand', 2);

      await controller.getSummary(
        mockRequest,
        { brandId: otherBrandId } as IngredientsQueryDto,
        { ...mockUser, isSuperAdmin: true },
      );

      expect(ingredientsService.getLibrarySummary).toHaveBeenCalledWith(
        organizationId,
        { brandId: otherBrandId },
      );
    });
  });

  describe('getBatch', () => {
    it('normalizes an s3Key-only asset to its canonical public CDN URL', async () => {
      ingredientsService.findByIds.mockResolvedValue([
        {
          cdnUrl: null,
          id: 'image-queued',
          s3Key: 'ingredients/images/image-queued.png',
        },
      ]);

      await expect(
        controller.getBatch(mockRequest, 'image-queued', mockUser),
      ).resolves.toEqual({
        data: {
          docs: [
            expect.objectContaining({
              cdnUrl:
                'https://cdn.genfeed.ai/ingredients/images/image-queued.png',
              id: 'image-queued',
            }),
          ],
        },
      });
    });
  });
});
