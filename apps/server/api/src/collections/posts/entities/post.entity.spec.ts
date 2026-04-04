import { PostEntity } from '@api/collections/posts/entities/post.entity';

describe('PostEntity', () => {
  it('should be defined', () => {
    expect(PostEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new PostEntity();
    expect(entity).toBeInstanceOf(PostEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new PostEntity();
  //     // Test properties
  //   });
  // });
});
