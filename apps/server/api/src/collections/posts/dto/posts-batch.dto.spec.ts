import {
  POSTS_BATCH_MAX_ITEMS,
  PostsBatchDto,
} from '@api/collections/posts/dto/posts-batch.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const VALID_ENTITY_ID = 'ckz1234567890abcdefghi';

function buildItems(count: number): Record<string, string>[] {
  return Array.from({ length: count }, (_, index) => ({
    postId: index.toString(16).padStart(24, '0'),
    scheduledDate: '2026-11-27T14:30:00Z',
    text: `Scheduled post ${index}`,
  }));
}

describe('PostsBatchDto', () => {
  it('should be defined', () => {
    expect(PostsBatchDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PostsBatchDto();
      expect(dto).toBeInstanceOf(PostsBatchDto);
    });

    it('accepts an item list at the maximum size', async () => {
      const dto = plainToInstance(PostsBatchDto, {
        credential: VALID_ENTITY_ID,
        items: buildItems(POSTS_BATCH_MAX_ITEMS),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects an item list over the maximum size', async () => {
      const dto = plainToInstance(PostsBatchDto, {
        credential: VALID_ENTITY_ID,
        items: buildItems(POSTS_BATCH_MAX_ITEMS + 1),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('items');
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects an item with an invalid post id', async () => {
      const dto = plainToInstance(PostsBatchDto, {
        credential: VALID_ENTITY_ID,
        items: [
          {
            postId: 'not-an-entity-id',
            scheduledDate: '2026-11-27T14:30:00Z',
            text: 'Scheduled post',
          },
        ],
      });

      const errors = await validate(dto);

      expect(JSON.stringify(errors)).toContain('isEntityId');
    });
  });
});
