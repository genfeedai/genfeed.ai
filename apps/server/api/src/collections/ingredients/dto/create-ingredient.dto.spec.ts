import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateIngredientDto', () => {
  it('should be defined', () => {
    expect(CreateIngredientDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateIngredientDto();
      expect(dto).toBeInstanceOf(CreateIngredientDto);
    });

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
