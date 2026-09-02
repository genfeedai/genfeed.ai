/**
 * Shared types for the analytics endpoint services.
 *
 * Colocated here instead of packages/contracts/src/interfaces to avoid touching shared
 * barrel exports while other agents are concurrently editing the workspace.
 */

import { CredentialPlatform } from '@genfeedai/contracts';
import type { IEntityAnalyticsStats } from '@genfeedai/contracts/interfaces';

// ---------------------------------------------------------------------------
// Admin summary
// ---------------------------------------------------------------------------

/** Stable projection serialized by GET /analytics. */
export interface AnalyticsAdminSummary {
  activeBots: number;
  activeWorkflows: number;
  monthlyGrowth: number;
  pendingPosts: number;
  recentActivities: number;
  totalBrands: number;
  totalCredentialsConnected: number;
  totalCredits: number;
  totalImages: number;
  totalModels: number;
  totalOrganizations: number;
  totalPosts: number;
  totalSubscriptions: number;
  totalUsers: number;
  totalVideos: number;
  totalViews: number;
  viewsGrowth: number;
}

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

/**
 * Organization document with aggregated fields.
 *
 * No `logo` — the Prisma `Organization` model has no logo column. The old
 * `logo: { cdnUrl }` relation was Mongo-era and permanently `undefined` at
 * runtime; `authProviderLogoUrl` is the column Better Auth actually populates.
 */
export interface OrganizationDoc {
  id: string;
  name?: string;
  label?: string;
  authProviderLogoUrl?: string | null;
  isDeleted?: boolean;
  createdAt?: Date;
}

/**
 * Brand document with aggregated fields.
 *
 * No `logo` — brand logos are `Asset` rows resolved through
 * `BrandsService.resolveBrandLogoUrls`, not a column on `Brand`.
 *
 * No `org` either. The Mongo-era populated relation is never populated
 * (`BrandsService` passes `undefined` for `BaseService`'s populate argument)
 * and the Prisma relation is named `organization`, not `org`. The owning
 * organization is reached through the `organizationId` scalar FK — see
 * `EntityLeaderboardService.resolveOrganizationNames`.
 */
export interface BrandDoc {
  id: string;
  name?: string;
  label?: string;
  organizationId?: string;
  isDeleted?: boolean;
  createdAt?: Date;
}

/**
 * Brand display values resolved in batched page-level reads and injected into
 * the brand projection, so a page of rows costs one query per value instead of
 * one per row.
 */
export interface ResolvedBrandDisplay {
  logoUrl?: string;
  organizationName?: string;
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
    /**
     * Which of the brand's accounts published this post. A brand may hold
     * several accounts on one platform, so stats have to be fetched as the
     * publishing account rather than as the brand default.
     */
    id: string;
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
