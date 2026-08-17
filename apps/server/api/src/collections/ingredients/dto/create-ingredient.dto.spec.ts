import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';

describe('CreateIngredientDto', () => {
  it('should be defined', () => {
    expect(CreateIngredientDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateIngredientDto();
      expect(dto).toBeInstanceOf(CreateIngredientDto);
    });
  });
});
