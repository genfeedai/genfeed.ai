import type { Platform } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ReplyBotConfig } from '@genfeedai/models/automation/reply-bot-config.model';
import { ReplyBotConfigSerializer } from '@genfeedai/serializers';
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
    return BaseService.getDataServiceInstance(ReplyBotConfigsService, token);
  }

  /**
   * Get all reply bot configs for an organization
   */
  async findAllByOrganization(
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfig[]> {
    return this.findAllPages({
      ...(brandId ? { brandId } : {}),
      organizationId,
    });
  }

  /**
   * Get active reply bot configs
   */
  async findActive(
    organizationId: string,
    brandId?: string,
  ): Promise<ReplyBotConfig[]> {
    return this.findAllPages({
      ...(brandId ? { brandId } : {}),
      isActive: true,
      organizationId,
    });
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
   * Enable/upsert X author-reply comment_responder for a brand.
   */
  async ensureAuthorResponder(params: {
    brandId: string;
    credentialId?: string;
    isActive?: boolean;
    platform?: Platform.TWITTER | Platform.YOUTUBE;
  }): Promise<{
    botConfigId: string;
    created: boolean;
    isActive: boolean;
    maxAgeHours: number;
    platform: string;
    xActivity?: {
      message: string;
      mode: 'live' | 'skipped';
    };
  }> {
    const response = await this.instance.post<{
      botConfigId: string;
      created: boolean;
      isActive: boolean;
      maxAgeHours: number;
      platform: string;
      xActivity?: {
        message: string;
        mode: 'live' | 'skipped';
      };
    }>('author-reply/ensure', params);
    return response.data;
  }

  /**
   * Comments on brand posts that still need a reply (X or YouTube).
   */
  async getAuthorReplyInbox(params: {
    brandId: string;
    hours?: number;
    platform?: Platform.TWITTER | Platform.YOUTUBE;
  }): Promise<{
    hours: number;
    items: Array<{
      authorDisplayName?: string;
      authorId: string;
      authorUsername: string;
      commentId: string;
      commentText: string;
      commentUrl?: string;
      createdAt: string;
      intent: 'thanks' | 'question' | 'troll' | 'spam' | 'default';
      intentLabel: string;
      parentPostId: string;
      parentPostPreview?: string;
      parentPostUrl?: string;
      shouldSkipAuto: boolean;
    }>;
    platform: string;
    username?: string;
  }> {
    const response = await this.instance.get('author-reply/inbox', {
      params,
    });
    return response.data;
  }

  async draftAuthorReply(params: {
    brandId: string;
    commentAuthor: string;
    commentId: string;
    commentText: string;
    intent?: 'thanks' | 'question' | 'troll' | 'spam' | 'default';
    parentPostPreview?: string;
    platform?: Platform.TWITTER | Platform.YOUTUBE;
  }): Promise<{
    commentId: string;
    draft: string;
    harnessApplied: boolean;
    intent: string;
    intentLabel: string;
  }> {
    const response = await this.instance.post('author-reply/draft', params);
    return response.data;
  }

  async sendAuthorReply(params: {
    brandId: string;
    commentAuthor: string;
    commentAuthorId?: string;
    commentId: string;
    commentText: string;
    intent?: 'thanks' | 'question' | 'troll' | 'spam' | 'default';
    parentPostId: string;
    parentPostPreview?: string;
    platform?: Platform.TWITTER | Platform.YOUTUBE;
    replyText?: string;
  }): Promise<{
    commentId: string;
    contentId?: string;
    contentUrl?: string;
    error?: string;
    intent?: string;
    replyText: string;
    success: boolean;
  }> {
    const response = await this.instance.post('author-reply/send', params);
    return response.data;
  }

  /**
   * Schedule 24h delayed post-watch series (X publish + YouTube publish hooks).
   */
  async schedulePostWatch(params: {
    brandId: string;
    platform?: Platform.TWITTER | Platform.YOUTUBE;
    postId: string;
    postPreview?: string;
  }): Promise<{ scheduled: number }> {
    const response = await this.instance.post<{ scheduled: number }>(
      'author-reply/schedule-post-watch',
      params,
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
