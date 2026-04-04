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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateIngredientDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
