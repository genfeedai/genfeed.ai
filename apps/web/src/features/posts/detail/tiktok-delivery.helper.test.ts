import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';
import { TIKTOK_DELIVERY_MODE_APP } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import { needsTikTokDeliveryChoice } from './tiktok-delivery.helper';

const video = [{ id: 'video-1' }] as never;

describe('needsTikTokDeliveryChoice', () => {
  it.each([
    ['a TikTok video with no recorded delivery', {}, true],
    ['a TikTok video recorded as direct', { deliveryMode: 'direct' }, true],
    [
      'a TikTok video recorded as Inbox delivery',
      { deliveryMode: TIKTOK_DELIVERY_MODE_APP },
      false,
    ],
  ])('%s', (_name, targetSettings, expected) => {
    expect(
      needsTikTokDeliveryChoice({
        category: PostCategory.VIDEO,
        ingredients: video,
        platform: CredentialPlatform.TIKTOK,
        targetSettings,
      }),
    ).toBe(expected);
  });

  it('does not ask for a reel without media or for another channel', () => {
    expect(
      needsTikTokDeliveryChoice({
        category: PostCategory.REEL,
        ingredients: [],
        platform: CredentialPlatform.TIKTOK,
        targetSettings: {},
      }),
    ).toBe(false);
    expect(
      needsTikTokDeliveryChoice({
        category: PostCategory.VIDEO,
        ingredients: video,
        platform: CredentialPlatform.YOUTUBE,
        targetSettings: {},
      }),
    ).toBe(false);
  });
});
