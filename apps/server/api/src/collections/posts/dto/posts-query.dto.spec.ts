import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { ValidationPipe } from '@server/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';

describe('PostsQueryDto', () => {
  it('should be defined', () => {
    expect(PostsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PostsQueryDto();
      expect(dto).toBeInstanceOf(PostsQueryDto);
    });

    it('rejects leftover Post.status through the request pipe', async () => {
      const pipe = new ValidationPipe();

      await expect(
        pipe.transform(
          { status: 'draft' },
          { metatype: PostsQueryDto, type: 'query' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
