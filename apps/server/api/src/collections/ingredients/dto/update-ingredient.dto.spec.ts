import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';

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
});
