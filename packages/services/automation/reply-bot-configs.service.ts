import { API_ENDPOINTS } from '@genfeedai/constants';
import { ReplyBotConfigSerializer } from '@genfeedai/serializers';
import { ReplyBotConfig } from '@models/automation/reply-bot-config.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class ReplyBotConfigsService extends BaseService<ReplyBotConfig> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.REPLY_BOT_CONFIGS,
      token,
      ReplyBotConfig,
      ReplyBotConfigSerializer,
    );
  }

  public static getInstance(token: string): ReplyBotConfigsService {
    return BaseService.getDataServiceInstance(
      ReplyBotConfigsService,
      token,
    ) as ReplyBotConfigsService;
  }

  /**
   * Get all reply bot configs for an organization
   */
  async findAllByOrganization(
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfig[]> {
    return this.findAll({
      ...(brandId ? { brand: brandId } : {}),
      organization: organizationId,
      pagination: false,
    });
  }

  /**
   * Get active reply bot configs
   */
  async findActive(
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfig[]> {
    return this.findAll({
      ...(brandId ? { brand: brandId } : {}),
      isActive: true,
      organization: organizationId,
      pagination: false,
    });
  }

  /**
   * Toggle the active status of a bot config
   */
  async toggleActive(id: string): Promise<ReplyBotConfig> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/toggle`,
    );
    return new ReplyBotConfig(this.extractResource(response.data));
  }

  /**
   * Test reply generation (dry run)
   */
  async testReplyGeneration(
    id: string,
    content: string,
    author: string,
  ): Promise<{ replyText: string; dmText?: string }> {
    const response = await this.instance.post<{
      replyText: string;
      dmText?: string;
    }>(`/${id}/test`, { author, content });
    return response.data;
  }

  /**
   * Manually trigger polling for the organization
   */
  async triggerPolling(credentialId: string): Promise<{ jobId: string }> {
    const response = await this.instance.post<{ jobId: string }>(
      'trigger-polling',
      { credentialId },
    );
    return response.data;
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const response = await this.instance.get<{
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    }>('queue-status');
    return response.data;
  }

  /**
   * Add a monitored account to the config
   */
  async addMonitoredAccount(
    configId: string,
    accountId: string,
  ): Promise<ReplyBotConfig> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${configId}/monitored-accounts`,
      { accountId },
    );
    return new ReplyBotConfig(this.extractResource(response.data));
  }

  /**
   * Remove a monitored account from the config
   */
  async removeMonitoredAccount(
    configId: string,
    accountId: string,
  ): Promise<ReplyBotConfig> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/${configId}/monitored-accounts/${accountId}`,
    );
    return new ReplyBotConfig(this.extractResource(response.data));
  }
}
