import { CredentialPlatform } from '@genfeedai/contracts';
import { HttpStatus } from '@nestjs/common';

import {
  generationFailureMessage,
  invalidThreadCountMessage,
  isAccountThreadFormat,
  isOwnedPost,
  isTwitterPlatform,
  postAccessBlockReason,
  threadExpansionBlockReason,
} from './posts-generation.helpers';

describe('account thread generation', () => {
  it('only validates count for thread format', () => {
    expect(isAccountThreadFormat('thread')).toBe(true);
    expect(isAccountThreadFormat('single')).toBe(false);
  });

  it('rejects thread counts outside 2-25', () => {
    expect(invalidThreadCountMessage(1)?.title).toBe('Invalid thread count');
    expect(invalidThreadCountMessage(26)?.detail).toContain('at most 25');
    expect(invalidThreadCountMessage(2)).toBeUndefined();
    expect(invalidThreadCountMessage(25)).toBeUndefined();
  });
});

describe('thread expansion eligibility', () => {
  it('blocks missing, foreign, already-expanded, and non-Twitter posts', () => {
    expect(
      threadExpansionBlockReason({
        existingChildren: 0,
        isOwned: true,
        isTwitter: true,
        postExists: false,
      })?.status,
    ).toBe(HttpStatus.NOT_FOUND);
    expect(
      threadExpansionBlockReason({
        existingChildren: 0,
        isOwned: false,
        isTwitter: true,
        postExists: true,
      })?.status,
    ).toBe(HttpStatus.FORBIDDEN);
    expect(
      threadExpansionBlockReason({
        existingChildren: 1,
        isOwned: true,
        isTwitter: true,
        postExists: true,
      })?.title,
    ).toBe('Already a thread');
    expect(
      threadExpansionBlockReason({
        existingChildren: 0,
        isOwned: true,
        isTwitter: false,
        postExists: true,
      })?.title,
    ).toBe('Platform not supported');
    expect(
      threadExpansionBlockReason({
        existingChildren: 0,
        isOwned: true,
        isTwitter: true,
        postExists: true,
      }),
    ).toBeUndefined();
  });

  it('recognizes Twitter/X platforms', () => {
    expect(isTwitterPlatform(CredentialPlatform.TWITTER)).toBe(true);
    expect(isTwitterPlatform('x')).toBe(true);
    expect(isTwitterPlatform('instagram')).toBe(false);
  });
});

describe('post access and error wrapping', () => {
  it('requires an owned post', () => {
    expect(isOwnedPost(null, 'org-1')).toBe(false);
    expect(isOwnedPost({ organizationId: 'org-2' }, 'org-1')).toBe(false);
    expect(isOwnedPost({ organizationId: 'org-1' }, 'org-1')).toBe(true);
    expect(postAccessBlockReason(null, 'org-1', 'post-1')?.title).toBe(
      'Post post-1 not found',
    );
    expect(
      postAccessBlockReason({ organizationId: 'org-2' }, 'org-1', 'post-1')
        ?.status,
    ).toBe(HttpStatus.FORBIDDEN);
    expect(
      postAccessBlockReason({ organizationId: 'org-1' }, 'org-1', 'post-1'),
    ).toBeUndefined();
  });

  it('falls back when the thrown error has no message', () => {
    expect(generationFailureMessage(new Error('boom'), 'fallback')).toBe(
      'boom',
    );
    expect(generationFailureMessage({}, 'fallback')).toBe('fallback');
  });
});
