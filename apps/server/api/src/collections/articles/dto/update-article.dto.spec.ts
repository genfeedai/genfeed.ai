import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';

describe('UpdateArticleDto', () => {
  it('should be defined', () => {
    expect(UpdateArticleDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateArticleDto();
      expect(dto).toBeInstanceOf(UpdateArticleDto);
    });
  });
});
