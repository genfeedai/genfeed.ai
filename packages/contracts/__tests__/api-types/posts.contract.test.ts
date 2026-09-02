import { describe, expect, it } from 'vitest';
import { PostFormat, PostStatus, TargetExecutionState } from '../../src';
import {
  createPostSchema,
  updatePostSchema,
} from '../../src/api-types/contracts/posts.contract';

describe('posts contract', () => {
  it('accepts an explicit X long-form format', () => {
    expect(
      createPostSchema.safeParse({
        // entityIdSchema only accepts uuid/cuid/cuid2/ulid, so this fixture
        // must be cuid-shaped. This package has no dependency on
        // @genfeedai/helpers, so the deterministic testId() shape is
        // hand-written rather than imported.
        credentialId: 'ccredential00000000000001',
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
