import {
  postModalSchema,
  threadModalSchema,
} from '@genfeedai/client/schemas/content/post.schema';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('draft authoring without accounts', () => {
  const draft = {
    credentialId: '',
    description: 'A tweet drafted before connecting X',
    platform: Platform.TWITTER,
    targetExecutionState: TargetExecutionState.DRAFT,
  };
  it('accepts a post draft with a platform and no account', () => {
    expect(postModalSchema.safeParse(draft).success).toBe(true);
  });
  it('accepts a thread draft without an account', () => {
    expect(
      threadModalSchema.safeParse({
        ...draft,
        posts: [{ description: 'First' }, { description: 'Second' }],
      }).success,
    ).toBe(true);
  });
  it('requires an account before scheduling', () => {
    const scheduled = {
      ...draft,
      scheduledDate: '2026-10-01T10:00:00Z',
      targetExecutionState: TargetExecutionState.SCHEDULED,
    };
    expect(postModalSchema.safeParse(scheduled).success).toBe(false);
    expect(
      threadModalSchema.safeParse({
        ...scheduled,
        posts: [{ description: 'First' }],
      }).success,
    ).toBe(false);
  });
  it('rejects blank draft content', () => {
    expect(
      postModalSchema.safeParse({ ...draft, description: '   ' }).success,
    ).toBe(false);
  });
});
