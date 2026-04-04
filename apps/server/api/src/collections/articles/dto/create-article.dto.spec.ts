import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';

describe('CreateArticleDto', () => {
  it('should be defined', () => {
    expect(CreateArticleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateArticleDto();
      expect(dto).toBeInstanceOf(CreateArticleDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateArticleDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
