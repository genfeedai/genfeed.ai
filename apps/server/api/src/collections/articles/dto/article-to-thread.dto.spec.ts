import { ArticleToThreadDto } from '@api/collections/articles/dto/article-to-thread.dto';

describe('ArticleToThreadDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ArticleToThreadDto();
      expect(dto).toBeInstanceOf(ArticleToThreadDto);
    });
  });
});
