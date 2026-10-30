import { EnsureReleaseFromPostDto } from '@api/collections/post-groups/dto/ensure-release-from-post.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('EnsureReleaseFromPostDto', () => {
  it('accepts a post id', async () => {
    const dto = plainToInstance(EnsureReleaseFromPostDto, { postId: 'post-1' });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    {},
    { postId: '' },
    { postId: null },
    { postId: 42 },
    { postId: { id: 'post-1' } },
  ])('rejects a malformed body %j', async (body) => {
    const dto = plainToInstance(EnsureReleaseFromPostDto, body);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
