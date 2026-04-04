export interface ITrackedLink {
  id: string;
  organizationId: string;

  // Link details
  originalUrl: string;
  shortUrl: string;
  shortCode: string;
  customSlug?: string;

  // Association (what content is this link from?)
  contentId?: string;
  contentType?: 'video' | 'image' | 'article' | 'caption';
  platform?: string;
  brandId?: string;
  campaignName?: string;

  // UTM parameters (for Google Analytics)
  utm: {
    source: string; // e.g., 'instagram', 'tiktok', 'youtube'
    medium: string; // e.g., 'social', 'video', 'bio-link'
    campaign?: string; // e.g., 'summer-sale-2025'
    content?: string; // e.g., 'video-hero', 'carousel-1'
    term?: string; // e.g., keywords
  };

  // Simple stats
  stats: {
    totalClicks: number;
    uniqueClicks: number;
    lastClickAt?: Date;
  };

  // Settings
  isActive: boolean;
  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface ILinkClick {
  id: string;
  linkId: string;

  // When & where
  timestamp: Date;

  // User info (anonymous)
  sessionId: string;
  isUnique: boolean;

  // Context
  referrer?: string;
  userAgent?: string;
  country?: string;
  device?: 'mobile' | 'desktop' | 'tablet';

  // Optional: Google Analytics client ID (for cross-platform tracking)
  gaClientId?: string;
}

export interface IUTMBuilder {
  url: string;
  source: string; // Required: Where traffic comes from
  medium: string; // Required: Marketing medium
  campaign?: string; // Recommended: Campaign name
  content?: string; // Optional: Content variant
  term?: string; // Optional: Keywords
}

export interface ILinkPerformance {
  linkId: string;
  url: string;
  shortUrl: string;

  // Content association
  contentId?: string;
  contentType?: string;
  platform?: string;

  // Performance
  totalClicks: number;
  uniqueClicks: number;
  clickThroughRate?: number;

  // Breakdown
  clicksByDate: Record<string, number>;
  clicksByCountry: Record<string, number>;
  clicksByDevice: Record<string, number>;
  clicksByReferrer: Record<string, number>;

  // Timeline
  createdAt: Date;
  lastClickAt?: Date;
}

export interface IGoogleAnalyticsEvent {
  eventName: string;
  eventParams: {
    content_id?: string;
    content_type?: string;
    platform?: string;
    campaign?: string;
    value?: number;
    [key: string]: string | number | undefined;
  };
}

export interface IContentCTAStats {
  contentId: string;
  contentType: string;

  // CTA performance
  totalLinks: number;
  totalClicks: number;
  uniqueClicks: number;
  avgClicksPerLink: number;

  // Best performing link
  topLink?: {
    url: string;
    clicks: number;
    ctr: number;
  };

  // Trends
  clickTrend: 'up' | 'down' | 'stable';
  clicksByDate: Record<string, number>;
}
