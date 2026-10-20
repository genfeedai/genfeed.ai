import { buildXReplyIntentUrl } from '@api/services/reply-bot/x-reply-intent.util';
import { describe, expect, it } from 'vitest';

describe('buildXReplyIntentUrl', () => {
  it('prefills the reply composer for the target post', () => {
    expect(
      buildXReplyIntentUrl('1846123456789012345', 'Fair point & more'),
    ).toBe(
      'https://x.com/intent/post?in_reply_to=1846123456789012345&text=Fair%20point%20%26%20more',
    );
  });

  it('refuses a target id that is not a post id', () => {
    expect(buildXReplyIntentUrl('abc&x=1', 'hi')).toBeNull();
    expect(buildXReplyIntentUrl('', 'hi')).toBeNull();
  });
});
