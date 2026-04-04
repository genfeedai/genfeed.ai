import type {
  ILeaderboardOptions,
  ITrend,
  ITrendHashtag,
  ITrendingHashtagOptions,
  ITrendingSoundOptions,
  ITrendPreferences,
  ITrendSound,
  ITrendVideo,
  IViralVideoOptions,
} from '@genfeedai/interfaces';
import { TrendSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { deserializeCollection } from '@helpers/data/json-api/json-api.helper';
import { Trend } from '@models/analytics/trend.model';
import type {
  RefreshTrendsResponse,
  TrendContentResponse,
  TrendDetailData,
  TrendSourceItem,
  TrendsResponse,
} from '@props/trends/trends-page.props';
import { BaseService } from '@services/core/base.service';

export class TrendsService extends BaseService<Trend> {
  constructor(token: string) {
    super(API_ENDPOINTS.TRENDS, token, Trend, TrendSerializer);
  }

  public static getInstance(token: string): TrendsService {
    return BaseService.getDataServiceInstance(
      TrendsService,
      token,
    ) as TrendsService;
  }

  async getPreferences(): Promise<ITrendPreferences | null> {
    const response = await this.instance.get<{
      preferences?: ITrendPreferences;
    }>('preferences');
    return response.data?.preferences || null;
  }

  async getTrendingTopics(): Promise<ITrend[]> {
    const response = await this.instance.get('/');
    return deserializeCollection<ITrend>(response.data);
  }

  async savePreferences(
    preferences: ITrendPreferences & { brandId?: string },
  ): Promise<ITrendPreferences> {
    const response = await this.instance.post<{
      preferences?: ITrendPreferences;
    }>('preferences', preferences);
    return response.data?.preferences || preferences;
  }

  /**
   * Get viral videos across platforms or for a specific platform
   * @param options - Filter options for viral videos
   * @returns List of viral videos sorted by viral score
   */
  async getViralVideos(
    options: IViralVideoOptions = {},
  ): Promise<ITrendVideo[]> {
    const params: Record<string, string | number> = {};
    if (options.platform) {
      params.platform = options.platform;
    }
    if (options.limit) {
      params.limit = options.limit;
    }
    if (options.timeframe) {
      params.timeframe = options.timeframe;
    }

    const response = await this.instance.get<{ videos?: ITrendVideo[] }>(
      '/videos',
      { params },
    );
    return response.data?.videos || [];
  }

  /**
   * Get cross-platform viral leaderboard
   * @param options - Leaderboard filter options
   * @returns Top viral videos across all platforms
   */
  async getViralLeaderboard(
    options: ILeaderboardOptions = {},
  ): Promise<ITrendVideo[]> {
    const params: Record<string, string | number> = {};
    if (options.timeframe) {
      params.timeframe = options.timeframe;
    }
    if (options.limit) {
      params.limit = options.limit;
    }

    const response = await this.instance.get<{ leaderboard?: ITrendVideo[] }>(
      '/leaderboard',
      { params },
    );
    return response.data?.leaderboard || [];
  }

  /**
   * Get trending hashtags for a platform
   * @param options - Filter options for hashtags
   * @returns List of trending hashtags sorted by virality score
   */
  async getTrendingHashtags(
    options: ITrendingHashtagOptions = {},
  ): Promise<ITrendHashtag[]> {
    const params: Record<string, string | number> = {};
    if (options.platform) {
      params.platform = options.platform;
    }
    if (options.limit) {
      params.limit = options.limit;
    }

    const response = await this.instance.get<{ hashtags?: ITrendHashtag[] }>(
      '/hashtags',
      { params },
    );
    return response.data?.hashtags || [];
  }

  /**
   * Get trending sounds (TikTok-specific)
   * @param options - Filter options for sounds
   * @returns List of trending sounds sorted by usage count
   */
  async getTrendingSounds(
    options: ITrendingSoundOptions = {},
  ): Promise<ITrendSound[]> {
    const params: Record<string, string | number> = {};
    if (options.limit) {
      params.limit = options.limit;
    }

    const response = await this.instance.get<{ sounds?: ITrendSound[] }>(
      '/sounds',
      { params },
    );
    return response.data?.sounds || [];
  }

  /**
   * Get trends with full discovery data (summary + platform access control)
   * Matches GET /trends controller with platform/refresh query params
   */
  async getTrendsDiscovery(options?: {
    platform?: string;
    refresh?: boolean;
  }): Promise<TrendsResponse> {
    const params: Record<string, string> = {};
    if (options?.platform) {
      params.platform = options.platform;
    }
    if (options?.refresh) {
      params.refresh = 'true';
    }

    const response = await this.instance.get<TrendsResponse>('/discovery', {
      params,
    });
    return (
      response.data || {
        summary: {
          connectedPlatforms: [],
          lockedPlatforms: [],
          totalTrends: 0,
        },
        trends: [],
      }
    );
  }

  async getTrendById(trendId: string): Promise<TrendDetailData> {
    const response = await this.instance.get<TrendDetailData>(`/${trendId}`);
    return response.data;
  }

  async getTrendContent(options?: {
    platform?: string;
    limit?: number;
    refresh?: boolean;
  }): Promise<TrendContentResponse> {
    const params: Record<string, string | number> = {};
    if (options?.platform) {
      params.platform = options.platform;
    }
    if (options?.limit) {
      params.limit = options.limit;
    }
    if (options?.refresh) {
      params.refresh = 'true';
    }

    const response = await this.instance.get<TrendContentResponse>('/content', {
      params,
    });

    return (
      response.data || {
        items: [],
        summary: {
          connectedPlatforms: [],
          lockedPlatforms: [],
          totalItems: 0,
          totalTrends: 0,
        },
      }
    );
  }

  async getTrendSources(
    trendId: string,
    limit: number = 5,
  ): Promise<TrendSourceItem[]> {
    const response = await this.instance.get<{ items?: TrendSourceItem[] }>(
      `/${trendId}/sources`,
      {
        params: { limit },
      },
    );
    return response.data?.items || [];
  }

  async refreshTrends(): Promise<RefreshTrendsResponse> {
    const response =
      await this.instance.post<RefreshTrendsResponse>('/refresh');
    return (
      response.data || { count: 0, message: 'Refresh failed', success: false }
    );
  }

  async getTurnoverStats(
    days: 7 | 30 | 90 = 30,
  ): Promise<TrendTurnoverResponse> {
    const response = await this.instance.get<TrendTurnoverResponse>(
      '/turnover',
      { params: { days } },
    );
    return response.data;
  }
}

export interface TrendTurnoverPlatformStats {
  platform: string;
  appeared: number;
  died: number;
  alive: number;
  avgLifespanDays: number;
  turnoverRate: number;
}

export interface TrendTimelineEntry {
  date: string;
  appeared: number;
  died: number;
}

export interface TrendTurnoverResponse {
  days: number;
  byPlatform: TrendTurnoverPlatformStats[];
  totals: Omit<TrendTurnoverPlatformStats, 'platform'>;
  timeline: TrendTimelineEntry[];
}
