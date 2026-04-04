import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import type {
  DmSender,
  MentionChecker,
  NewFollowerChecker,
  NewLikeChecker,
  NewRepostChecker,
  ReplyPublisher,
} from '@genfeedai/workflow-engine';
import { Injectable } from '@nestjs/common';

export type SocialPlatformKey = 'twitter' | 'instagram';

/**
 * Unified interface for all social adapter capabilities.
 */
export interface SocialAdapterInterface {
  createReplyPublisher(): ReplyPublisher;
  createDmSender(): DmSender;
  createFollowerChecker(): NewFollowerChecker;
  createMentionChecker(): MentionChecker;
  createLikeChecker(): NewLikeChecker;
  createRepostChecker(): NewRepostChecker;
}

/**
 * Factory that returns the correct social adapter based on platform string.
 */
@Injectable()
export class SocialAdapterFactory {
  private readonly adapters: Map<SocialPlatformKey, SocialAdapterInterface>;

  constructor(
    private readonly twitterAdapter: TwitterSocialAdapter,
    private readonly instagramAdapter: InstagramSocialAdapter,
  ) {
    this.adapters = new Map<SocialPlatformKey, SocialAdapterInterface>([
      ['twitter', this.twitterAdapter],
      ['instagram', this.instagramAdapter],
    ]);
  }

  /**
   * Get the adapter for a given platform.
   * @throws Error if platform is not supported.
   */
  getAdapter(platform: string): SocialAdapterInterface {
    const adapter = this.adapters.get(platform as SocialPlatformKey);
    if (!adapter) {
      throw new Error(
        `Unsupported social platform: ${platform}. Supported: ${[...this.adapters.keys()].join(', ')}`,
      );
    }
    return adapter;
  }

  /**
   * Check if a platform is supported.
   */
  isSupported(platform: string): platform is SocialPlatformKey {
    return this.adapters.has(platform as SocialPlatformKey);
  }

  /**
   * Get all supported platform keys.
   */
  getSupportedPlatforms(): SocialPlatformKey[] {
    return [...this.adapters.keys()];
  }
}
