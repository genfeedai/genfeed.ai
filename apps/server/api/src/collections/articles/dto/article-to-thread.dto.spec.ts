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
  });
});
