import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SocialAdapterFactory', () => {
  let factory: SocialAdapterFactory;
  let twitterAdapter: TwitterSocialAdapter;
  let instagramAdapter: InstagramSocialAdapter;

  beforeEach(() => {
    twitterAdapter = {
      createDmSender: vi.fn(),
      createFollowerChecker: vi.fn(),
      createLikeChecker: vi.fn(),
      createMentionChecker: vi.fn(),
      createReplyPublisher: vi.fn(),
      createRepostChecker: vi.fn(),
    } as unknown as TwitterSocialAdapter;

    instagramAdapter = {
      createDmSender: vi.fn(),
      createFollowerChecker: vi.fn(),
      createLikeChecker: vi.fn(),
      createMentionChecker: vi.fn(),
      createReplyPublisher: vi.fn(),
      createRepostChecker: vi.fn(),
    } as unknown as InstagramSocialAdapter;

    factory = new SocialAdapterFactory(twitterAdapter, instagramAdapter);
  });

  it('should return twitter adapter for "twitter"', () => {
    expect(factory.getAdapter('twitter')).toBe(twitterAdapter);
  });

  it('should return instagram adapter for "instagram"', () => {
    expect(factory.getAdapter('instagram')).toBe(instagramAdapter);
  });

  it('should throw for unsupported platform', () => {
    expect(() => factory.getAdapter('tiktok')).toThrow(
      'Unsupported social platform: tiktok',
    );
  });

  it('should report supported platforms', () => {
    expect(factory.isSupported('twitter')).toBe(true);
    expect(factory.isSupported('instagram')).toBe(true);
    expect(factory.isSupported('tiktok')).toBe(false);
  });

  it('should list supported platforms', () => {
    expect(factory.getSupportedPlatforms()).toEqual(['twitter', 'instagram']);
  });
});
