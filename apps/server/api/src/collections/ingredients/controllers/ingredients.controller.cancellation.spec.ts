vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('IngredientsController.cancelGeneration', () => {
  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439014',
    },
  };
  const mockRequest = { originalUrl: '/api/ingredients', query: {} } as Request;
  const cancellationService = {
    cancelProcessingIngredient: vi.fn(),
  };

  const controller = new IngredientsController(
    {} as never,
    {} as never,
    cancellationService as unknown as IngredientGenerationCancellationService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the cancellations route metadata', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        IngredientsController.prototype.cancelGeneration,
      ),
    ).toBe(':ingredientId/cancellations');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        IngredientsController.prototype.cancelGeneration,
      ),
    ).toBe(RequestMethod.POST);
  });

  it('delegates cancellation with authenticated org scope', async () => {
    const ingredient = { id: 'ing-1', status: 'FAILED' };
    cancellationService.cancelProcessingIngredient.mockResolvedValue(
      ingredient,
    );

    await expect(
      controller.cancelGeneration(mockRequest, 'ing-1', mockUser),
    ).resolves.toEqual({ data: ingredient });
    expect(cancellationService.cancelProcessingIngredient).toHaveBeenCalledWith(
      {
        id: 'ing-1',
        organizationId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439014',
      },
    );
  });
});
