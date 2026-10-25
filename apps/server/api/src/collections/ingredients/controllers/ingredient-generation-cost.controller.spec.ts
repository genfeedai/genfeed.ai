import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientGenerationCostController } from '@api/collections/ingredients/controllers/ingredient-generation-cost.controller';
import type { IngredientGenerationCostService } from '@api/collections/ingredients/services/ingredient-generation-cost.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const organizationId = testId('org');
const ingredientId = testId('ingredient');
const user = {
  id: testId('user'),
  organizationId,
  userId: testId('user'),
} as unknown as User;
const request = { params: { ingredientId }, query: {} } as unknown as Request;

describe('IngredientGenerationCostController', () => {
  it('returns the cost scoped to the caller organization', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ credits: 42, status: 'settled' as const });
    const controller = new IngredientGenerationCostController({
      find,
    } as unknown as IngredientGenerationCostService);

    await expect(
      controller.findGenerationCost(request, user, ingredientId),
    ).resolves.toEqual({
      data: { credits: 42, id: ingredientId, status: 'settled' },
    });
    expect(find).toHaveBeenCalledWith(organizationId, ingredientId);
  });

  it('answers with no cost when the caller has no organization', async () => {
    const find = vi.fn();
    const controller = new IngredientGenerationCostController({
      find,
    } as unknown as IngredientGenerationCostService);

    await expect(
      controller.findGenerationCost(
        request,
        { id: testId('user') } as unknown as User,
        ingredientId,
      ),
    ).resolves.toEqual({
      data: { credits: null, id: ingredientId, status: null },
    });
    expect(find).not.toHaveBeenCalled();
  });
});
