import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ingredientRowWorld } from '@api-test/fixtures/ingredient-row.world';
import { IngredientStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

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

const ORG = testId('org');
const BRAND = testId('brand');
const INGREDIENT = testId('ingredient');

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

function controllerFor(status: IngredientStatus) {
  const row: Record<string, unknown> = {
    brandId: BRAND,
    id: INGREDIENT,
    isDeleted: false,
    organizationId: ORG,
    status,
  };
  const world = ingredientRowWorld(row);
  const ingredients = {
    ...world,
    findOne: async () => ({ ...row }),
  } as unknown as IngredientsService;
  const controller = new IngredientsController(
    ingredients,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    row,
    update: (dto: Record<string, unknown>) =>
      controller.update(request, INGREDIENT, user, dto),
  };
}

describe('IngredientsController.update status (#10404)', () => {
  it.each([
    [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
    [IngredientStatus.GENERATED, IngredientStatus.REJECTED],
    [IngredientStatus.REJECTED, IngredientStatus.VALIDATED],
  ])('lets a review move %s to %s', async (from, to) => {
    const { row, update } = controllerFor(from);

    await update({ status: to });

    expect(row.status).toBe(to);
  });

  it.each([IngredientStatus.VALIDATED, IngredientStatus.REJECTED])(
    'refuses to write %s onto an ingredient that is still PROCESSING',
    async (to) => {
      const { row, update } = controllerFor(IngredientStatus.PROCESSING);

      await expect(
        update({ status: to, isFavorite: true }),
      ).rejects.toMatchObject({ status: 409 });
      expect(row).toMatchObject({ status: IngredientStatus.PROCESSING });
      expect(row.isFavorite).toBeUndefined();
    },
  );

  it('refuses to reopen an archived ingredient', async () => {
    const { row, update } = controllerFor(IngredientStatus.ARCHIVED);

    await expect(
      update({ status: IngredientStatus.GENERATED }),
    ).rejects.toMatchObject({ status: 409 });
    expect(row.status).toBe(IngredientStatus.ARCHIVED);
  });

  it('keeps a status the request repeats and still writes the other fields', async () => {
    const { row, update } = controllerFor(IngredientStatus.GENERATED);

    await update({ isFavorite: true, status: IngredientStatus.GENERATED });

    expect(row).toMatchObject({
      isFavorite: true,
      status: IngredientStatus.GENERATED,
    });
  });
});
