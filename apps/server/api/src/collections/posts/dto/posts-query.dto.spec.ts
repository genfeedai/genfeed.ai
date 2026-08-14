import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new PostsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
