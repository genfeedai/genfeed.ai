import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { testId } from '@helpers/testing/test-id.helper';

describe('PostsQueryDto', () => {
  describe('validation', () => {
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
