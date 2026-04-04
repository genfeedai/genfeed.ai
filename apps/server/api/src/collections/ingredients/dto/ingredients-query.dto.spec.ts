import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';

describe('IngredientsQueryDto', () => {
  it('should be defined', () => {
    expect(IngredientsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new IngredientsQueryDto();
      expect(dto).toBeInstanceOf(IngredientsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new IngredientsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
