import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IBotActivityStats } from '@genfeedai/contracts/interfaces';
import { BotActivity } from '@genfeedai/models/automation/bot-activity.model';
import { BotActivitySerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface BotActivitiesQuery {
  organizationId?: string;
  brandId?: string;
  replyBotConfigId?: string;
  monitoredAccountId?: string;
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
    return BaseService.getDataServiceInstance(BotActivitiesService, token);
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
    replyBotConfigId?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<IBotActivityStats> {
    const response = await this.instance.get<IBotActivityStats>(
      '/stats/summary',
      {
        params: {
          fromDate,
          replyBotConfigId,
          toDate,
        },
      },
    );
    return response.data;
  }

  /**
   * Get activities by organization
   */
  async findByOrganization(
    organizationId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ): Promise<{ data: BotActivity[]; total: number }> {
    return this.findWithFilters({
      organizationId,
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
      replyBotConfigId,
      ...options,
    });
  }
}
