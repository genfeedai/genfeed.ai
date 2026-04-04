import type { IBotActivityStats } from '@cloud/interfaces';
import { BotActivitySerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { BotActivity } from '@models/automation/bot-activity.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface BotActivitiesQuery {
  organization?: string;
  brand?: string;
  replyBotConfig?: string;
  monitoredAccount?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export class BotActivitiesService extends BaseService<BotActivity> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.BOT_ACTIVITIES,
      token,
      BotActivity,
      BotActivitySerializer,
    );
  }

  public static getInstance(token: string): BotActivitiesService {
    return BaseService.getDataServiceInstance(
      BotActivitiesService,
      token,
    ) as BotActivitiesService;
  }

  /**
   * Get bot activities with filters and pagination
   */
  async findWithFilters(
    query: BotActivitiesQuery,
  ): Promise<{ data: BotActivity[]; total: number }> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
    });
    const data = this.extractCollection<Partial<BotActivity>>(
      response.data,
    ).map((item) => new BotActivity(item));
    return {
      data,
      total: (response.data?.meta?.total as number) || data.length,
    };
  }

  /**
   * Get aggregated statistics for bot activities
   */
  async getStats(
    brandId?: string,
    replyBotConfigId?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<IBotActivityStats> {
    const response = await this.instance.get<IBotActivityStats>(
      '/stats/summary',
      {
        params: {
          ...(brandId ? { brand: brandId } : {}),
          fromDate,
          replyBotConfig: replyBotConfigId,
          toDate,
        },
      },
    );
    return response.data;
  }

  /**
   * Get recent activities for a specific bot config
   */
  async getRecentByConfig(
    configId: string,
    limit: number = 10,
  ): Promise<BotActivity[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/recent/${configId}`,
      {
        params: { limit },
      },
    );
    return this.extractCollection<Partial<BotActivity>>(response.data).map(
      (item) => new BotActivity(item),
    );
  }

  /**
   * Get activities by organization
   */
  async findByOrganization(
    organizationId: string,
    brandId?: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ): Promise<{ data: BotActivity[]; total: number }> {
    return this.findWithFilters({
      ...(brandId ? { brand: brandId } : {}),
      organization: organizationId,
      ...options,
    });
  }

  /**
   * Get activities by bot config
   */
  async findByBotConfig(
    replyBotConfigId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ): Promise<{ data: BotActivity[]; total: number }> {
    return this.findWithFilters({
      replyBotConfig: replyBotConfigId,
      ...options,
    });
  }
}
