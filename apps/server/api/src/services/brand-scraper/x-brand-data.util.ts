import type {
  WebsiteBrandScrapeEvidence,
  XProfileScrapedData,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { PublicXBrandSourceService } from '@api/services/brand-scraper/public-x-brand-source.service';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';

import { load } from 'cheerio';

const X_PROFILE_HANDLE_PATTERN = /(?:twitter\.com|x\.com)\/([^/?#]+)/;
const EMOJI_PATTERN =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u;

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

export function toXSetupEvidence(
  profile: XProfileScrapedData,
  url: string,
): WebsiteBrandScrapeEvidence {
  return {
    data: toXBrandData(profile, url),
    diagnostics: [],
    fontCandidates: [],
    evidence: [
      {
        sourceType: 'website',
        label: 'Public X profile',
        url: profile.sourceUrl,
        excerpt: profile.latestPostText,
      },
    ],
  };
}

export function parsePublicXProfileHtml(
  html: string,
  url: string,
): XProfileScrapedData {
  const $ = load(html);
  const bio =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim();
  // Public HTML can start with a pinned post. Keep a single example and leave
  // latestPostText to the API, which identifies the actual most recent post.
  const firstPost = $(
    'article [data-testid="tweetText"], [class*="tweet-text"]',
  )
    .first()
    .text()
    .trim();
  const example = firstPost.length > 5 ? firstPost : '';
  return {
    handle: url.match(X_PROFILE_HANDLE_PATTERN)?.[1],
    displayName:
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').first().text().trim(),
    bio,
    profileImageUrl: $('meta[property="og:image"]').attr('content')?.trim(),
    recentTweets: example ? [example] : [],
    contentStyle: {
      contentTypes: [],
      usesEmojis: EMOJI_PATTERN.test(example),
      usesHashtags: Boolean(bio?.includes('#') || example.includes('#')),
      ...(example ? { avgTweetLength: example.length } : {}),
    },
    sourceUrl: url,
    scrapedAt: new Date(),
  };
}

export function toXProfileScrapedData(
  snapshot: NonNullable<
    Awaited<ReturnType<PublicXBrandSourceService['profile']>>
  >,
): XProfileScrapedData {
  return {
    handle: snapshot.handle,
    displayName: snapshot.name,
    bio: snapshot.bio,
    bannerImageUrl: snapshot.banner,
    profileImageUrl: snapshot.avatar,
    latestPostText: snapshot.latestText,
    recentTweets: snapshot.latestSample ? [snapshot.latestSample.text] : [],
    contentStyle: {
      contentTypes: [],
      usesEmojis: false,
      usesHashtags: false,
    },
    sourceUrl: `https://x.com/${snapshot.handle}`,
    scrapedAt: new Date(snapshot.readAt),
  };
}
