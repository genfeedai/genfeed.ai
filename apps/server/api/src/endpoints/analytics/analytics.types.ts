/**
 * Shared types for the analytics endpoint services.
 *
 * Colocated here instead of packages/interfaces to avoid touching shared
 * barrel exports while other agents are concurrently editing the workspace.
 */

import { CredentialPlatform } from '@genfeedai/enums';
import type { IEntityAnalyticsStats } from '@genfeedai/interfaces';

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

/** Parsed date range covering both current and previous periods */
export interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

// ---------------------------------------------------------------------------
// Entity-leaderboard internal types
// ---------------------------------------------------------------------------

/** Organization document with aggregated fields */
export interface OrganizationDoc {
  id: string;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  isDeleted?: boolean;
  createdAt?: Date;
}

/** Brand document with aggregated fields */
export interface BrandDoc {
  id: string;
  name?: string;
  label?: string;
  logo?: { cdnUrl?: string };
  organizationId?: string;
  org?: OrganizationDoc;
  isDeleted?: boolean;
  createdAt?: Date;
}

/** Stats for leaderboard sorting */
export interface LeaderboardStats {
  id: string;
  name: string;
  logo?: string;
  avgEngagementRate: number;
  growth: number;
  totalEngagement: number;
  totalPosts: number;
  totalViews: number;
  activePlatforms?: string[];
  organizationId?: string;
  organizationName?: string;
}

/** Raw row from $queryRaw analytics aggregation */
export interface AnalyticsAggRow {
  entity_id: string;
  avg_engagement_rate: number;
  total_views: bigint;
  total_likes: bigint;
  total_comments: bigint;
  total_shares: bigint;
  total_saves: bigint;
  unique_posts: bigint;
  platforms?: string[];
}

/** Raw row from $queryRaw previous-engagement aggregation */
export interface EngagementAggRow {
  entity_id: string;
  total_engagement: bigint;
}

/** One entity paired with its current + previous period stats */
export interface EntityStatsRow<TEntity> {
  entity: TEntity;
  stats: IEntityAnalyticsStats;
  prevEngagement: number;
}

export interface PaginationSlice<TItem> {
  data: TItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Analytics-export internal types
// ---------------------------------------------------------------------------

export interface ExportPostData {
  id: string;
  label: string;
  description?: string;
  status: string;
  scheduledDate?: Date;
  publicationDate?: Date;
  tags?: string[];
  views?: number;
  isRepeat?: boolean;
  repeatFrequency?: string;
  repeatInterval?: number;
  repeatCount?: number;
  maxRepeats?: number;
  createdAt: Date;
  updatedAt: Date;
  externalId?: string;
  credential: {
    platform: CredentialPlatform;
  };
  ingredient: {
    metadata: string;
  };
  metadata?: {
    label?: string;
    description?: string;
    extension?: string;
    model?: string;
    style?: string;
  };
  organizationId: string;
  brandId: string;
}

export interface ProcessedExportData {
  id: string;
  title: string;
  description?: string;
  status: string;
  platform: CredentialPlatform;
  scheduledDate?: Date;
  publicationDate?: Date;
  views: number;
  likes: number;
  comments: number;
  tags: string;
  videoLabel: string;
  videoDescription: string;
  extension: string;
  model: string;
  style: string;
  isRepeat?: boolean;
  repeatFrequency: string;
  repeatInterval: number;
  repeatCount: number;
  maxRepeats: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportRowData {
  [key: string]: string | number | Date | boolean | undefined;
}

export interface PlatformStats {
  comments: number;
  likes: number;
  views: number;
}
