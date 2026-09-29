import { describe, expect, it } from 'vitest';
import { PostStatus, TargetExecutionState } from '../../src';
import {
  createPostSchema,
  updatePostSchema,
} from '../../src/api-types/contracts/posts.contract';

describe('posts contract', () => {
  it('does not keep leftover Post.status on create', () => {
    const parsed = createPostSchema.parse({
      credentialId: 'ccredential00000000000001',
      description: 'A long X post body',
      ingredients: [],
      label: 'Launch essay',
      status: PostStatus.DRAFT,
      targetExecutionState: TargetExecutionState.DRAFT,
    });

    expect(parsed).not.toHaveProperty('status');
    expect(parsed.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it('rejects unknown post formats', () => {
    expect(updatePostSchema.safeParse({ format: 'article' }).success).toBe(
      false,
    );
  });
});
