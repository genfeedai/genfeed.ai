import { BulkDeleteIngredientsDto } from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';

describe('BulkDeleteIngredientsDto', () => {
  it('should be defined', () => {
    expect(BulkDeleteIngredientsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BulkDeleteIngredientsDto();
      expect(dto).toBeInstanceOf(BulkDeleteIngredientsDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BulkDeleteIngredientsDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
