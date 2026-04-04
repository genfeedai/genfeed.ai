import { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';

describe('GenerateArticlesDto', () => {
  it('should be defined', () => {
    expect(GenerateArticlesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateArticlesDto();
      expect(dto).toBeInstanceOf(GenerateArticlesDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new GenerateArticlesDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
