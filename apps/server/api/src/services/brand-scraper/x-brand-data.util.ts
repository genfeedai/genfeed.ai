import type { XProfileScrapedData } from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';

export function toXBrandData(
  profile: XProfileScrapedData,
  sourceUrl: string,
): IScrapedBrandData {
  return {
    companyName: profile.displayName,
    description: profile.bio,
    metaDescription: profile.bio,
    logoUrl: profile.profileImageUrl,
    ogImage: profile.profileImageUrl,
    bannerUrl: profile.bannerImageUrl,
    socialPostSamples: profile.recentTweets,
    socialLinks: { twitter: profile.sourceUrl },
    scrapedAt: profile.scrapedAt,
    sourceUrl,
    valuePropositions: [],
  };
}
