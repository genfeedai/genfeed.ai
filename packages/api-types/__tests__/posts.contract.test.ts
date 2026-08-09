import { PostFormat, PostStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  createPostSchema,
  updatePostSchema,
} from '../src/contracts/posts.contract';

describe('posts contract', () => {
  it('accepts an explicit X long-form format', () => {
    expect(
      createPostSchema.safeParse({
        credentialId: 'cmptu23g70001zixnzwbzwp2e',
        description: 'A long X post body',
        format: PostFormat.LONG_FORM,
        ingredients: [],
        label: 'Launch essay',
        status: PostStatus.DRAFT,
      }).success,
    ).toBe(true);
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
