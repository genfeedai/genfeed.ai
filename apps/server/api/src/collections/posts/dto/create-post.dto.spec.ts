import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { PostStatus } from '@genfeedai/enums';
import { validate } from 'class-validator';

describe('CreatePostDto', () => {
  const validEntityId = 'ckz1234567890abcdefghi';

  it('should be defined', () => {
    expect(CreatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePostDto();
      expect(dto).toBeInstanceOf(CreatePostDto);
    });

    it('accepts publish attribution and experiment metadata', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        contentRunId: validEntityId,
        creativeVersion: 'creative-v2',
        credential: validEntityId,
        description: 'Caption',
        hookVersion: 'hook-v1',
        ingredients: [],
        label: 'Post',
        personaId: 'ckz1234567890abcdefgij',
        publishIntent: 'experiment',
        scheduleSlot: 'weekday-morning',
        status: PostStatus.SCHEDULED,
        variantId: 'trend-remix-post-thread',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects invalid content run attribution IDs', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        contentRunId: 'not-an-entity-id',
        credential: validEntityId,
        description: 'Caption',
        ingredients: [],
        label: 'Post',
        status: PostStatus.SCHEDULED,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'contentRunId')).toBe(
        true,
      );
    });
  });
});
