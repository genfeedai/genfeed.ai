import { PostEntity } from '@server/collections/posts/entities/post.entity';

describe('PostEntity', () => {
  it('should be defined', () => {
    expect(PostEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new PostEntity();
    expect(entity).toBeInstanceOf(PostEntity);
  });
});
