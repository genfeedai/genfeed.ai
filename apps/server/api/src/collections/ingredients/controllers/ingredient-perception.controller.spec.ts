import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientPerceptionController } from '@api/collections/ingredients/controllers/ingredient-perception.controller';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => {
    throw new Error(`${name}:${id} not found`);
  }),
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

describe('IngredientPerceptionController', () => {
  it('returns the perception record scoped to the caller organization', async () => {
    const perception = { id: testId('perception'), ingredientId };
    const getForAsset = vi.fn().mockResolvedValue(perception);
    const controller = new IngredientPerceptionController(
      {
        getForAsset,
      } as unknown as MediaPerceptionService,
      {} as MediaModerationService,
    );

    await expect(
      controller.findPerception(request, user, ingredientId),
    ).resolves.toEqual({ data: perception });
    expect(getForAsset).toHaveBeenCalledWith(organizationId, ingredientId);
  });

  it('answers not found when the asset has no record yet', async () => {
    const controller = new IngredientPerceptionController(
      {
        getForAsset: vi.fn().mockResolvedValue(null),
      } as unknown as MediaPerceptionService,
      {} as MediaModerationService,
    );

    await expect(
      controller.findPerception(request, user, ingredientId),
    ).rejects.toThrow('not found');
  });

  it('returns the moderation record scoped to the caller organization', async () => {
    const moderation = { id: testId('moderation'), ingredientId };
    const getForAsset = vi.fn().mockResolvedValue(moderation);
    const controller = new IngredientPerceptionController(
      {} as MediaPerceptionService,
      { getForAsset } as unknown as MediaModerationService,
    );

    await expect(
      controller.findModeration(request, user, ingredientId),
    ).resolves.toEqual({ data: moderation });
    expect(getForAsset).toHaveBeenCalledWith(organizationId, ingredientId);
  });
});
