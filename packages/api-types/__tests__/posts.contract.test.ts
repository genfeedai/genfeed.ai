import { PostFormat, PostStatus, TargetExecutionState } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  updatePostSchema,
} from '../src/contracts/posts.contract';

describe('posts contract', () => {
  it('accepts an explicit X long-form format', () => {
    expect(
      createPostSchema.safeParse({
        // entityIdSchema only accepts uuid/cuid/cuid2/ulid, so this fixture
        // must be a real cuid rather than a readable placeholder.
        credentialId: 'cmptu23g70001zixnzwbzwp2e',
        description: 'A long X post body',
        format: PostFormat.LONG_FORM,
        ingredients: [],
        label: 'Launch essay',
        targetExecutionState: TargetExecutionState.DRAFT,
      }).success,
    ).toBe(true);
  });

  it('does not keep leftover Post.status on create', () => {
    const parsed = createPostSchema.parse({
      credentialId: 'cmptu23g70001zixnzwbzwp2e',
      description: 'A long X post body',
      ingredients: [],
      label: 'Launch essay',
      status: PostStatus.DRAFT,
      targetExecutionState: TargetExecutionState.DRAFT,
    });

    expect(parsed).not.toHaveProperty('status');
    expect(parsed.targetExecutionState).toBe(TargetExecutionState.DRAFT);
  });

  it('accepts converting an existing post into a thread root', () => {
    expect(
      updatePostSchema.safeParse({ format: PostFormat.THREAD }).success,
    ).toBe(true);
  });

  it('rejects unknown post formats', () => {
    expect(updatePostSchema.safeParse({ format: 'article' }).success).toBe(
      false,
    );
  });
});
