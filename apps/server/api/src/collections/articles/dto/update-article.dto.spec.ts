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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateArticleDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
