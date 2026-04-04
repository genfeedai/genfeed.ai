import type { IAnalytics, IQueryParams } from '@genfeedai/interfaces';
import type {
  IViralHookAnalysis,
  IViralHookVideo,
} from '@genfeedai/interfaces/analytics/viral-hooks.interface';
import type { AnalyticsMetric } from '@genfeedai/enums';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

// Admin Analytics Types
export interface IOrgLeaderboardItem {
  rank: number;
  organization: {
    id: string;
    name: string;
    logo?: string;
  };
  totalPosts: number;
  totalEngagement: number;
  totalViews: number;
  avgEngagementRate: number;
  growth: number;
}

export interface IOrgWithStats {
  id: string;
  name: string;
  logo?: string;
  totalPosts: number;
  totalEngagement: number;
  totalViews: number;
  totalBrands: number;
  totalMembers: number;
  avgEngagementRate: number;
  growth: number;
  createdAt: string;
}

export interface IBrandWithStats {
  id: string;
  name: string;
  logo?: string;
  organizationId: string;
  organizationName: string;
  totalPosts: number;
  totalEngagement: number;
  totalViews: number;
  avgEngagementRate: number;
  growth: number;
  activePlatforms: string[];
  createdAt: string;
}

export interface IPaginatedOrgsResponse {
  data: IOrgWithStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IPaginatedBrandsResponse {
  data: IBrandWithStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IAnalyticsDateRange {
  startDate?: string;
  endDate?: string;
}

export interface ILeaderboardQueryParams extends IAnalyticsDateRange {
  sort?:
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.POSTS;
  limit?: number;
}

export interface IAdminOrgsQueryParams extends IAnalyticsDateRange {
  page?: number;
  limit?: number;
  sort?:
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.POSTS;
}

// Chart Data Types
export interface BrandPerformanceData {
  name: string;
  views: number;
  engagement: number;
  posts: number;
}

export interface PlatformBreakdownData {
  platform: string;
  value: number;
  posts?: number;
}

// Business Analytics Types (Super Admin)
export interface IBusinessAnalyticsRevenue {
  today: number;
  last7d: number;
  last30d: number;
  mtd: number;
  dailySeries: Array<{ date: string; amount: number }>;
  wowGrowth: number;
}

export interface IBusinessAnalyticsCredits {
  sold: number;
  consumed: number;
  dailySoldSeries: Array<{ date: string; amount: number }>;
  dailyConsumedSeries: Array<{ date: string; amount: number }>;
  wowGrowth: number;
}

export interface IBusinessAnalyticsIngredients {
  today: number;
  last7d: number;
  last30d: number;
  dailySeries: Array<{ date: string; count: number }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  wowGrowth: number;
}

export interface IBusinessAnalyticsLeader {
  organizationId: string;
  organizationName: string;
  amount: number;
  count?: number;
}

export interface IBusinessAnalyticsProjections {
  revenueNext30d: number | null;
  creditsNext30d: number | null;
  ingredientsNext30d: number | null;
  isEstimate: boolean;
  insufficientData: boolean;
}

export interface IBusinessAnalyticsComparisons {
  cashInVsUsageValue: { cashIn: number; usageValue: number };
  soldVsConsumed: { sold: number; consumed: number };
  outstandingPrepaid: number;
}

export interface IBusinessAnalytics {
  revenue: IBusinessAnalyticsRevenue;
  credits: IBusinessAnalyticsCredits;
  ingredients: IBusinessAnalyticsIngredients;
  leaders: {
    byRevenue: IBusinessAnalyticsLeader[];
    byCredits: IBusinessAnalyticsLeader[];
    byIngredients: IBusinessAnalyticsLeader[];
  };
  projections: IBusinessAnalyticsProjections;
  comparisons: IBusinessAnalyticsComparisons;
}

export class AnalyticsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/analytics`, token);
  }

  public static getInstance(token: string): AnalyticsService {
    return HTTPBaseService.getBaseServiceInstance(
      AnalyticsService,
      token,
    ) as AnalyticsService;
  }

  public async findAll(query?: IQueryParams): Promise<IAnalytics> {
    return await this.instance
      .get<JsonApiResponseDocument>('', { params: query })
      .then((res) => deserializeResource<IAnalytics>(res.data));
  }

  public async exportData(
    format: 'csv' | 'xlsx',
    fields: string[],
    query?: IQueryParams,
  ): Promise<ArrayBuffer> {
    const params = {
      fields: fields.join(','),
      format,
      ...query,
    };
    return await this.instance
      .get<ArrayBuffer>('export', { params, responseType: 'arraybuffer' })
      .then((res) => res.data);
  }

  public async getOverview(query?: IQueryParams): Promise<unknown> {
    return await this.instance
      .get<JsonApiResponseDocument>('overview', { params: query })
      .then((res) => deserializeResource<unknown>(res.data));
  }

  public async getTopContent(query?: IQueryParams): Promise<unknown[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('top', { params: query })
      .then((res) => deserializeCollection<unknown>(res.data));
  }

  public async getPlatformComparison(query?: IQueryParams): Promise<unknown> {
    return await this.instance
      .get<JsonApiResponseDocument>('platforms', { params: query })
      .then((res) => deserializeResource<unknown>(res.data));
  }

  public async getTimeSeries(query?: IQueryParams): Promise<unknown> {
    return await this.instance
      .get<JsonApiResponseDocument>('timeseries', { params: query })
      .then((res) => deserializeResource<unknown>(res.data));
  }

  public async getGrowthTrends(query?: IQueryParams): Promise<unknown> {
    return await this.instance
      .get<JsonApiResponseDocument>('growth', { params: query })
      .then((res) => deserializeResource<unknown>(res.data));
  }

  public async getEngagement(query?: IQueryParams): Promise<unknown> {
    return await this.instance
      .get<JsonApiResponseDocument>('engagement', { params: query })
      .then((res) => deserializeResource<unknown>(res.data));
  }

  public async getViralHooks(
    query?: IQueryParams,
  ): Promise<{ videos: IViralHookVideo[]; analysis: IViralHookAnalysis }> {
    return await this.instance
      .get<JsonApiResponseDocument>('hooks', { params: query })
      .then((res) =>
        deserializeResource<{
          videos: IViralHookVideo[];
          analysis: IViralHookAnalysis;
        }>(res.data),
      );
  }

  // ============================================
  // Admin Analytics Methods (Super Admin Only)
  // ============================================

  /**
   * Get organization leaderboard - top performing orgs
   * @requires Super Admin
   */
  public async getOrganizationsLeaderboard(
    params?: ILeaderboardQueryParams,
  ): Promise<IOrgLeaderboardItem[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('organizations/leaderboard', { params })
      .then((res) => deserializeCollection<IOrgLeaderboardItem>(res.data));
  }

  /**
   * Get brands leaderboard - scoped to organization for non-superadmins
   */
  public async getBrandsLeaderboard(
    params?: ILeaderboardQueryParams,
  ): Promise<IBrandWithStats[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('brands/leaderboard', { params })
      .then((res) => deserializeCollection<IBrandWithStats>(res.data));
  }

  /**
   * Get all organizations with analytics stats (paginated)
   * @requires Super Admin
   */
  public async getOrganizationsWithStats(
    params?: IAdminOrgsQueryParams,
  ): Promise<IPaginatedOrgsResponse> {
    return await this.instance
      .get<JsonApiResponseDocument>('organizations', { params })
      .then((res) => deserializeResource<IPaginatedOrgsResponse>(res.data));
  }

  /**
   * Get all brands with analytics stats (paginated)
   * Organization-scoped for non-superadmins
   */
  public async getBrandsWithStats(
    params?: IAdminOrgsQueryParams,
  ): Promise<IPaginatedBrandsResponse> {
    return await this.instance
      .get<JsonApiResponseDocument>('brands', { params })
      .then((res) => deserializeResource<IPaginatedBrandsResponse>(res.data));
  }

  /**
   * Get business analytics dashboard data
   * @requires Super Admin
   */
  public async getBusinessAnalytics(): Promise<IBusinessAnalytics> {
    return await this.instance
      .get<JsonApiResponseDocument>('business')
      .then((res) => deserializeResource<IBusinessAnalytics>(res.data));
  }
}
