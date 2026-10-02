import type {
  IBrandKitDiagnostic,
  IBrandKitSourceEvidence,
  IScrapedBrandData,
  IScrapedImageCandidate,
} from '@genfeedai/contracts/interfaces';

export interface WebsiteStylesheetEvidence {
  url: string;
  cssText: string;
}
export interface WebsiteFontCandidate {
  family: string;
  sourceUrl: string;
  weight?: string;
  style?: string;
  availability: 'unknown';
}
export interface WebsiteBrandScrapeEvidence {
  data: IScrapedBrandData;
  evidence: IBrandKitSourceEvidence[];
  diagnostics: IBrandKitDiagnostic[];
  fontCandidates: WebsiteFontCandidate[];
}
export interface WebsiteFetchBudget {
  deadlineAt: number;
}

/**
 * LinkedIn company page data extracted from scraping
 */
export interface LinkedInScrapedData {
  companyName?: string;
  description?: string;
  industry?: string;
  employeeCount?: string;
  headquarters?: string;
  website?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  recentPosts: string[];
  sourceUrl: string;
  scrapedAt: Date;
}

/**
 * X/Twitter profile data extracted from scraping
 */
export interface XProfileScrapedData {
  displayName?: string;
  handle?: string;
  bio?: string;
  pinnedTweet?: string;
  recentTweets: string[];
  followerCount?: string;
  followingCount?: string;
  profileImageUrl?: string;
  bannerImageUrl?: string;
  contentStyle: {
    avgTweetLength?: number;
    usesHashtags: boolean;
    usesEmojis: boolean;
    contentTypes: string[];
  };
  sourceUrl: string;
  scrapedAt: Date;
}

/**
 * Combined brand sources for multi-source scraping
 */
export interface BrandScrapeSources {
  websiteUrl?: string;
  linkedinUrl?: string;
  xProfileUrl?: string;
}

/**
 * Merged analysis from all scraped sources
 */
export interface MergedBrandAnalysis {
  companyName?: string;
  description?: string;
  tagline?: string;
  industry?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  heroText?: string;
  valuePropositions: string[];
  aboutText?: string;
  socialLinks: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  contentSamples: string[];
  contentStyle?: {
    tone?: string;
    usesHashtags?: boolean;
    usesEmojis?: boolean;
    avgPostLength?: number;
  };
  audience?: string;
  sourceUrls: string[];
  scrapedAt: Date;
}

/**
 * Minimal brand data extracted from meta tags as a fallback
 * when full scraping fails (e.g., JS-rendered pages, timeouts)
 */
export interface MetaTagFallbackData {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  siteName?: string;
  sourceUrl: string;
  scrapedAt: Date;
}

/**
 * Website content extracted from scraping
 */
export interface WebsiteScrapingResult {
  stylesheetUrls?: string[];
  evidence?: IBrandKitSourceEvidence[];
  diagnostics?: IBrandKitDiagnostic[];
  fontDetails?: WebsiteFontCandidate[];
  // Meta information
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageType?: string;
  favicon?: string;
  /** Absolute apple-touch-icon and icon URLs, best first. */
  icons: IScrapedImageCandidate[];
  canonical?: string;

  // Colors extracted from CSS
  colors: {
    primary?: string;
    secondary?: string;
    background?: string;
    accent?: string[];
  };

  // Typography
  fonts: string[];

  // Content
  headings: string[];
  paragraphs: string[];
  heroText?: string;
  aboutText?: string;
  valuePropositions: string[];

  // Images
  logoUrl?: string;
  bannerUrl?: string;
  images: Array<{
    src: string;
    alt?: string;
  }>;

  // Social links
  socialLinks: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };

  // Technical
  technologies?: string[];
  scrapedAt: Date;
  sourceUrl: string;
}

export interface WebsiteResponseState {
  deadlineAt: number;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  url: string;
}

export interface WebsiteStylesheetByteBudget {
  bytes: number;
}
