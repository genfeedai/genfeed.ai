import { PostEntity } from '@api/collections/posts/entities/post.entity';

describe('PostEntity', () => {
  it('should create an instance', () => {
    const entity = new PostEntity();
    expect(entity).toBeInstanceOf(PostEntity);
  });
});
