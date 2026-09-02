import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { testId } from '@helpers/testing/test-id.helper';
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

    it('accepts the production publishing library query', async () => {
      const pipe = new ValidationPipe();
      const brandId = testId('brand');
      const organizationId = testId('organization');

      await expect(
        pipe.transform(
          {
            brandId,
            limit: '100',
            organizationId,
            page: '1',
            sort: 'createdAt: -1',
          },
          { metatype: PostsQueryDto, type: 'query' },
        ),
      ).resolves.toMatchObject({
        brandId,
        limit: 100,
        organizationId,
        page: 1,
        sort: 'createdAt: -1',
      });
    });
  });
});
