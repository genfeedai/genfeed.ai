import type {
  PaidCreativePlatformReadiness,
  PaidCreativeProviderAdapter,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import { GoogleAdsTransparencyProvider } from '@api/services/paid-creative-research/providers/google-ads-transparency.provider';
import { MetaAdLibraryProvider } from '@api/services/paid-creative-research/providers/meta-ad-library.provider';
import { TikTokCreativeCenterProvider } from '@api/services/paid-creative-research/providers/tiktok-creative-center.provider';
import { XAdsRepositoryProvider } from '@api/services/paid-creative-research/providers/x-ads-repository.provider';
import type { PaidCreativePlatform } from '@genfeedai/integrations/ads';
import {
  PAID_CREATIVE_PLATFORMS,
  resolvePaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { Injectable } from '@nestjs/common';

/**
 * The one place a watched platform turns into a transparency adapter.
 *
 * `youtube` and `google` deliberately resolve to the same adapter: YouTube
 * video ads are Google Ads creatives and the Google Ads Transparency Center is
 * their only public archive, so a separate YouTube pool would be fiction.
 */
@Injectable()
export class PaidCreativeProviderRegistry {
  constructor(
    private readonly googleAdsTransparencyProvider: GoogleAdsTransparencyProvider,
    private readonly metaAdLibraryProvider: MetaAdLibraryProvider,
    private readonly tikTokCreativeCenterProvider: TikTokCreativeCenterProvider,
    private readonly xAdsRepositoryProvider: XAdsRepositoryProvider,
  ) {}

  resolve(platform: PaidCreativePlatform): PaidCreativeProviderAdapter {
    switch (resolvePaidCreativeProvider(platform)) {
      case 'google_ads_transparency_center':
        return this.googleAdsTransparencyProvider;
      case 'meta_ads_library':
        return this.metaAdLibraryProvider;
      case 'tiktok_creative_center':
        return this.tikTokCreativeCenterProvider;
      default:
        return this.xAdsRepositoryProvider;
    }
  }

  /** Per-platform readiness, for the operator-facing watchlist surface. */
  getReadiness(): PaidCreativePlatformReadiness[] {
    return PAID_CREATIVE_PLATFORMS.map((platform) => {
      const adapter = this.resolve(platform);

      return {
        ...adapter.getReadiness(),
        platform,
        provider: adapter.provider,
      };
    });
  }
}
