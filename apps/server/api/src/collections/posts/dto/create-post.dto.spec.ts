import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { TargetExecutionState } from '@genfeedai/contracts';
import { validate } from 'class-validator';

describe('CreatePostDto', () => {
  const validEntityId = 'ckz1234567890abcdefghi';

  describe('validation', () => {
    it('rejects invalid content run attribution IDs', async () => {
      const dto = Object.assign(new CreatePostDto(), {
        contentRunId: 'not-an-entity-id',
        credentialId: validEntityId,
        description: 'Caption',
        ingredients: [],
        label: 'Post',
        targetExecutionState: TargetExecutionState.SCHEDULED,
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'contentRunId')).toBe(
        true,
      );
    });
  });
});
