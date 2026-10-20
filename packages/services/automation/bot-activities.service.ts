import { BotActivityStatus } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IAssistedReplyOpenResult,
  IAssistedReplyUsage,
  IBotActivityStats,
} from '@genfeedai/contracts/interfaces';
import { BotActivity } from '@genfeedai/models/automation/bot-activity.model';
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
    super(API_ENDPOINTS.BOT_ACTIVITIES, token, BotActivity);
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
      total: response.data?.links?.pagination?.total ?? data.length,
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
   * X replies drafted for a person to review and post themselves.
   */
  findAwaitingApproval(
    options: { limit?: number; page?: number } = {},
  ): Promise<{ data: BotActivity[]; total: number }> {
    return this.findWithFilters({
      status: BotActivityStatus.AWAITING_APPROVAL,
      ...options,
    });
  }

  async getReplyQueueUsage(): Promise<IAssistedReplyUsage> {
    const response =
      await this.instance.get<IAssistedReplyUsage>('/reply-queue/usage');
    return response.data;
  }

  /** Saves the edited draft and returns X's prefilled reply composer link. */
  async openReplyQueueItem(
    id: string,
    replyText?: string,
  ): Promise<IAssistedReplyOpenResult> {
    const response = await this.instance.post<IAssistedReplyOpenResult>(
      `/${id}/reply-queue/open`,
      { replyText },
    );
    return response.data;
  }

  async confirmReplyQueueItemPosted(id: string): Promise<IAssistedReplyUsage> {
    const response = await this.instance.post<IAssistedReplyUsage>(
      `/${id}/reply-queue/posted`,
    );
    return response.data;
  }

  async dismissReplyQueueItem(id: string): Promise<IAssistedReplyUsage> {
    const response = await this.instance.post<IAssistedReplyUsage>(
      `/${id}/reply-queue/dismiss`,
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
