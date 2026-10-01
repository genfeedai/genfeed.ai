import { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { AssetCategory } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';

describe('CreateFromIngredientDto category admission', () => {
  it.each([AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE])(
    'accepts declared category %s',
    async (category) => {
      await expect(
        new ValidationPipe().transform(
          {
            ...{
              ingredientId: testId('ingredient'),
              parentId: testId('brand'),
              category: AssetCategory.LOGO,
            },
            category,
          },
          { metatype: CreateFromIngredientDto, type: 'body' },
        ),
      ).resolves.toMatchObject({ category });
    },
  );
  it('rejects FONT', async () => {
    await expect(
      new ValidationPipe().transform(
        {
          ...{
            ingredientId: testId('ingredient'),
            parentId: testId('brand'),
            category: AssetCategory.LOGO,
          },
          category: AssetCategory.FONT,
        },
        { metatype: CreateFromIngredientDto, type: 'body' },
      ),
    ).rejects.toThrow();
  });
});
