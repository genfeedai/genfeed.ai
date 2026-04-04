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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateIngredientDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
