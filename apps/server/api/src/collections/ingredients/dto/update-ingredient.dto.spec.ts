import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { testId } from '@helpers/testing/test-id.helper';
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

describe('ingredient provenance at the HTTP boundary', () => {
  const fields = [
    'organizationId',
    'userId',
    'brandId',
    'metadataId',
    'parentId',
    'promptId',
    'trainingId',
    'bookmarkId',
    'personaId',
    'workflowExecutionId',
    'agentStrategyId',
    'sourceActionId',
    'sources',
    'providerData',
    'mergeSettings',
  ];
  it.each(fields)(
    'strips server-owned %s while preserving an ordinary edit',
    async (field) => {
      const value =
        field === 'sources'
          ? [testId('ingredient')]
          : field === 'providerData'
            ? { result: 'https://cdn.example.test/other-object' }
            : testId('record');
      const result = await new ValidationPipe().transform(
        { [field]: value, isFavorite: true },
        { metatype: UpdateIngredientDto, type: 'body' },
      );
      expect(result).not.toHaveProperty(field);
      expect(result).toHaveProperty('isFavorite', true);
    },
  );
});

describe('alt text at the HTTP boundary', () => {
  const transform = (body: Record<string, unknown>) =>
    new ValidationPipe().transform(body, {
      metatype: UpdateIngredientDto,
      type: 'body',
    });

  it('keeps alt text up to 1,000 characters', async () => {
    const result = await transform({ altText: 'a'.repeat(1000) });

    expect(result).toHaveProperty('altText', 'a'.repeat(1000));
  });

  it('keeps an empty string, which clears the alt text', async () => {
    const result = await transform({ altText: '' });

    expect(result).toHaveProperty('altText', '');
  });

  it('refuses alt text over 1,000 characters', async () => {
    await expect(transform({ altText: 'a'.repeat(1001) })).rejects.toThrow();
  });

  it('refuses alt text that is not text', async () => {
    await expect(transform({ altText: 42 })).rejects.toThrow();
  });
});
