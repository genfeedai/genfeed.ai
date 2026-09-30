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
  });
});
