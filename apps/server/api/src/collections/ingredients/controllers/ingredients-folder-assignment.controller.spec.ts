import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import type { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
    }),
  };
});

interface Row {
  brandId: string | null;
  folderId?: string | null;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  tags?: string[];
}

interface Where {
  id: string;
  isDeleted: boolean;
  organizationId: string;
}

const ORG = testId('org');
const OTHER_ORG = testId('org', 2);
const BRAND = testId('brand');
const OTHER_BRAND = testId('brand', 2);
const INGREDIENT = testId('ingredient');
const FOLDER = testId('folder');
const TAG = testId('tag');
const FOREIGN_TAG = testId('tag', 2);

const user = {
  brandId: BRAND,
  id: testId('user'),
  organizationId: ORG,
  userId: testId('user'),
} as unknown as User;
const request = {
  originalUrl: `/api/ingredients/${INGREDIENT}`,
  params: { ingredientId: INGREDIENT },
  query: {},
} as unknown as Request;

const notFound = (id: string) => ({
  response: {
    detail: `IngredientsController ${id} doesn't exist`,
    title: 'IngredientsController not found',
  },
  status: 404,
});

describe('IngredientsController folder assignment', () => {
  let ingredients: Map<string, Row>;
  let folders: Map<string, Row>;
  let orgTags: Map<string, string>;
  let controller: IngredientsController;

  const find = (table: Map<string, Row>, where: Where) => {
    const row = table.get(where.id);
    return row &&
      row.organizationId === where.organizationId &&
      row.isDeleted === where.isDeleted
      ? { ...row }
      : null;
  };
  const update = (dto: Record<string, unknown>) =>
    controller.update(request, INGREDIENT, user, dto);

  beforeEach(() => {
    ingredients = new Map([
      [
        INGREDIENT,
        {
          brandId: BRAND,
          folderId: null,
          id: INGREDIENT,
          isDeleted: false,
          organizationId: ORG,
        },
      ],
    ]);
    folders = new Map([
      [
        FOLDER,
        { brandId: BRAND, id: FOLDER, isDeleted: false, organizationId: ORG },
      ],
    ]);
    orgTags = new Map([
      [TAG, ORG],
      [FOREIGN_TAG, OTHER_ORG],
    ]);

    const ingredientsService = {
      assertClientTags: async (tags: string[], organizationId: string) => {
        if (tags.some((tag) => orgTags.get(tag) !== organizationId)) {
          throw new Error('Tags must belong to the current organization');
        }
      },
      findOne: async (where: Where) => find(ingredients, where),
      patch: async (id: string, data: Partial<Row>) =>
        Object.assign(ingredients.get(id) ?? {}, data),
    } as unknown as IngredientsService;
    const foldersService = {
      findOneSelect: async (where: Where) => find(folders, where),
    } as unknown as FoldersService;

    controller = new IngredientsController(
      ingredientsService,
      foldersService,
      {} as IngredientGenerationCancellationService,
      {} as ConfigService,
      {} as MediaUrlService,
    );
  });

  it('files an asset into a folder of the caller brand', async () => {
    await expect(update({ folderId: FOLDER })).resolves.toEqual({
      data: expect.objectContaining({ folderId: FOLDER, id: INGREDIENT }),
    });
    expect(ingredients.get(INGREDIENT)?.folderId).toBe(FOLDER);
  });

  it('files an asset into an organization-wide folder', async () => {
    Object.assign(folders.get(FOLDER) ?? {}, { brandId: null });

    await update({ folderId: FOLDER });

    expect(ingredients.get(INGREDIENT)?.folderId).toBe(FOLDER);
  });

  it.each([
    ['of another brand', { brandId: OTHER_BRAND }],
    ['of another organization', { organizationId: OTHER_ORG }],
    ['that was deleted', { isDeleted: true }],
  ])('refuses a folder %s', async (_case, fields) => {
    Object.assign(folders.get(FOLDER) ?? {}, fields);

    await expect(update({ folderId: FOLDER })).rejects.toMatchObject(
      notFound(FOLDER),
    );
    expect(ingredients.get(INGREDIENT)?.folderId).toBeNull();
  });

  it.each([
    ['of another brand', { brandId: OTHER_BRAND }],
    ['of another organization', { organizationId: OTHER_ORG }],
  ])('refuses to file an asset %s', async (_case, fields) => {
    Object.assign(ingredients.get(INGREDIENT) ?? {}, fields);

    await expect(update({ folderId: FOLDER })).rejects.toMatchObject(
      notFound(INGREDIENT),
    );
    expect(ingredients.get(INGREDIENT)?.folderId).toBeNull();
  });

  it('takes an asset out of its folder even after the folder is gone', async () => {
    Object.assign(ingredients.get(INGREDIENT) ?? {}, { folderId: FOLDER });
    folders.clear();

    await update({ folderId: null });

    expect(ingredients.get(INGREDIENT)?.folderId).toBeNull();
  });

  it('tags an asset with organization tags', async () => {
    await update({ tags: [TAG] });

    expect(ingredients.get(INGREDIENT)?.tags).toEqual([TAG]);
  });

  it('refuses foreign tags before changing the asset', async () => {
    await expect(
      update({ folderId: FOLDER, tags: [TAG, FOREIGN_TAG] }),
    ).rejects.toThrow('Tags must belong to the current organization');
    expect(ingredients.get(INGREDIENT)).toEqual({
      brandId: BRAND,
      folderId: null,
      id: INGREDIENT,
      isDeleted: false,
      organizationId: ORG,
    });
  });
});
