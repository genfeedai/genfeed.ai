import {
  OUTLIER_READ_POST_LIMIT,
  OUTLIER_WEEKLY_READ_APIFY_CALLER,
} from '@api/collections/outlier-library/outlier-library-weekly-read.constants';
import type { ClaimedOutlierCreator } from '@api/collections/outlier-library/services/outlier-read-claim.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { runWithApifyCaller } from '@api/services/integrations/apify/utils/apify-caller.context';
import { InstagramBusinessDiscoveryProvider } from '@api/services/source-collector/providers/instagram-business-discovery.provider';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import { Platform, SocialSourcePlatform } from '@genfeedai/contracts';
import type {
  OutlierLibraryPlatform,
  OutlierLibraryPostInput,
} from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

function toPostInput(
  post: CollectedSourcePost,
): OutlierLibraryPostInput | null {
  if (!post.id || !post.contentUrl || !post.createdAt) {
    return null;
  }
  return {
    caption: post.text,
    comments: post.metrics?.comments ?? null,
    externalId: post.id,
    format: post.contentType ?? null,
    hashtags: post.hashtags,
    isPinned: post.isPinned ?? null,
    isPromoted: post.isPromoted ?? null,
    likes: post.metrics?.likes ?? null,
    publishedAt: post.createdAt,
    url: post.contentUrl,
    views: post.metrics?.views ?? null,
  };
}

/**
 * Reads one creator's recent posts, one platform at a time (#11642).
 *
 * - TikTok: the profile scraper already in the allowlist, through the source
 *   collector, with every run named after the weekly read.
 * - Instagram: Business Discovery on the Genfeed-owned professional account
 *   named in the platform settings. No scraper fallback, so it costs nothing.
 * - YouTube: not read until the Analytics & Reporting amendment (#11639).
 */
@Traced()
@Injectable()
export class OutlierCreatorReaderService {
  constructor(
    private readonly sourceCollector: SourceCollectorService,
    private readonly instagramDiscovery: InstagramBusinessDiscoveryProvider,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** False while the platform has no way to read, so its creators just wait. */
  async canRead(platform: OutlierLibraryPlatform): Promise<boolean> {
    if (platform === Platform.TIKTOK) {
      return true;
    }
    if (platform === Platform.INSTAGRAM) {
      return (await this.instagramAccount()) !== null;
    }
    return false;
  }

  async read(
    creator: Pick<ClaimedOutlierCreator, 'handle' | 'platform'>,
  ): Promise<OutlierLibraryPostInput[]> {
    const collected = await this.collect(creator);
    return collected.posts
      .map(toPostInput)
      .filter((post): post is OutlierLibraryPostInput => post !== null);
  }

  private async collect(
    creator: Pick<ClaimedOutlierCreator, 'handle' | 'platform'>,
  ) {
    if (creator.platform === Platform.TIKTOK) {
      return runWithApifyCaller(OUTLIER_WEEKLY_READ_APIFY_CALLER, () =>
        this.sourceCollector.collectTimeline(
          SocialSourcePlatform.TIKTOK,
          creator.handle,
          { limit: OUTLIER_READ_POST_LIMIT },
        ),
      );
    }
    if (creator.platform === Platform.INSTAGRAM) {
      const account = await this.instagramAccount();
      if (!account) {
        throw new Error('No Instagram reader account is configured');
      }
      return this.instagramDiscovery.collectTimeline(
        SocialSourcePlatform.INSTAGRAM,
        creator.handle,
        { ...account, limit: OUTLIER_READ_POST_LIMIT },
      );
    }
    throw new Error(`${creator.platform} creators are not read yet`);
  }

  private async instagramAccount(): Promise<{
    brandId: string;
    credentialId: string;
    organizationId: string;
  } | null> {
    const settings = await this.platformSettings.getSingleton();
    const {
      outlierLibraryInstagramBrandId: brandId,
      outlierLibraryInstagramCredentialId: credentialId,
      outlierLibraryInstagramOrganizationId: organizationId,
    } = settings;
    return brandId && credentialId && organizationId
      ? { brandId, credentialId, organizationId }
      : null;
  }
}
