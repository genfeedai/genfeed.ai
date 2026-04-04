import { ArticleToThreadDto } from '@api/collections/articles/dto/article-to-thread.dto';

describe('ArticleToThreadDto', () => {
  it('should be defined', () => {
    expect(ArticleToThreadDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ArticleToThreadDto();
      expect(dto).toBeInstanceOf(ArticleToThreadDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ArticleToThreadDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
