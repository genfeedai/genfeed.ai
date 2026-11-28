import { creatorOfVideo } from '@api/collections/outlier-library/services/outlier-creator-seed.service';
import { Platform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('creatorOfVideo', () => {
  it('names a TikTok creator by the lowercase handle, so two scrapes stay one row', () => {
    expect(
      creatorOfVideo({ creatorHandle: '@DancerOne', platform: 'tiktok' }),
    ).toEqual({
      externalId: 'dancerone',
      handle: 'DancerOne',
      platform: Platform.TIKTOK,
    });
  });

  it('skips a video with no creator and a platform the library does not seed from', () => {
    expect(creatorOfVideo({ platform: 'tiktok' })).toBeNull();
    expect(
      creatorOfVideo({ creatorHandle: 'someone', platform: 'youtube' }),
    ).toBeNull();
  });
});
