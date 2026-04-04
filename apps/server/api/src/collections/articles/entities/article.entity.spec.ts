import { ArticleEntity } from '@api/collections/articles/entities/article.entity';

describe('ArticleEntity', () => {
  it('should be defined', () => {
    expect(ArticleEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ArticleEntity();
    expect(entity).toBeInstanceOf(ArticleEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new ArticleEntity();
  //     // Test properties
  //   });
  // });
});
