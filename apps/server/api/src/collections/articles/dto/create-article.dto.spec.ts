import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';

describe('CreateArticleDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateArticleDto();
      expect(dto).toBeInstanceOf(CreateArticleDto);
    });
  });
});
