import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import { validate } from 'class-validator';

describe('UpdatePostDto', () => {
  it('should be defined', () => {
    expect(UpdatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePostDto();
      expect(dto).toBeInstanceOf(UpdatePostDto);
    });

    it('accepts partial publish attribution updates', async () => {
      const dto = Object.assign(new UpdatePostDto(), {
        contentRunId: 'ckz1234567890abcdefghi',
        creativeVersion: 'creative-v2',
        hookVersion: 'hook-v1',
        personaId: 'ckz1234567890abcdefgij',
        publishIntent: 'campaign',
        scheduleSlot: 'weekday-morning',
        variantId: 'variant-a',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
