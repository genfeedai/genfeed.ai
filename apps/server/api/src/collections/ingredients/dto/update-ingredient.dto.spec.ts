import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { ArgumentMetadata } from '@nestjs/common';

describe('UpdateIngredientDto', () => {
  it('should be defined', () => {
    expect(UpdateIngredientDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateIngredientDto();
      expect(dto).toBeInstanceOf(UpdateIngredientDto);
    });
  });

  describe('storage identity', () => {
    const pipe = new ValidationPipe();
    const metadata: ArgumentMetadata = {
      metatype: UpdateIngredientDto,
      type: 'body',
    };

    it('strips client-supplied s3Key and cdnUrl through the global pipe', async () => {
      const result = await pipe.transform(
        {
          cdnUrl: 'https://cdn.genfeed.ai/ingredients/images/other-tenant.png',
          isFavorite: true,
          s3Key: 'ingredients/images/other-tenant.png',
        },
        metadata,
      );

      expect(result).not.toHaveProperty('s3Key');
      expect(result).not.toHaveProperty('cdnUrl');
      expect(result).toHaveProperty('isFavorite', true);
    });
  });
});
