import { Platform } from '@genfeedai/contracts';
import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { resolvePublishingHoverPreview } from '@pages/posts/library/publishing-post-hover-preview';
import { describe, expect, it } from 'vitest';

describe('resolvePublishingHoverPreview', () => {
  it('keeps a standalone post on the existing platform preview', () => {
    const post = {
      description: 'Image content hits hard',
      id: 'post-1',
      platform: Platform.INSTAGRAM,
    } as IPost;

    expect(resolvePublishingHoverPreview({ post })).toEqual({
      kind: 'post',
      post,
    });
  });

  it('builds a channel card from the release and drops caption from channel settings', () => {
    const release = {
      attachments: [],
      baseContent: 'Shared caption',
      id: 'release-1',
      media: [],
      targets: [
        {
          id: 'target-1',
          platform: Platform.TWITTER,
          settings: { caption: 'Tweet text', replyPolicy: 'everyone' },
        },
      ],
      title: 'Launch',
    } as unknown as IReleaseGroup;

    const preview = resolvePublishingHoverPreview({ release });

    expect(preview?.kind).toBe('targets');
    if (preview?.kind !== 'targets') {
      return;
    }

    expect(preview.targets[0]?.caption).toBe('Tweet text');
    expect(preview.targets[0]?.platform).toBe(Platform.TWITTER);
    expect(preview.targets[0]?.settings).toEqual({ replyPolicy: 'everyone' });
    expect(preview.targets[0]?.settings).not.toHaveProperty('caption');
  });

  it('returns nothing when the row has no post copy', () => {
    expect(resolvePublishingHoverPreview({})).toBeNull();
    expect(
      resolvePublishingHoverPreview({
        post: { description: '   ', id: 'empty' } as IPost,
      }),
    ).toBeNull();
  });
});
