import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateIngredientDto', () => {
  describe('validation', () => {
    it('rejects an unbounded agent source action identity', async () => {
      const dto = plainToInstance(CreateIngredientDto, {
        sourceActionId: 'a'.repeat(129),
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'sourceActionId')).toBe(
        true,
      );
    });
  });
});
