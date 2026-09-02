import type {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/contracts';
import { CampaignTargetType } from '@genfeedai/contracts';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

/**
 * Campaign model interface
 */
export interface ICampaign {
  id: string;
  organizationId: string;
  brandId?: string;
  userId?: string;
  credentialId: string;
  label: string;
  description?: string;
  platform: CampaignPlatform;
  campaignType: CampaignType;
  status: CampaignStatus;
  discoveryConfig?: {
    keywords?: string[];
    hashtags?: string[];
    subreddits?: string[];
    excludeAuthors?: string[];
    minEngagement?: number;
    maxEngagement?: number;
    maxAgeHours?: number;
    minRelevanceScore?: number;
  };
  aiConfig?: {
    tone?: string;
    length?: string;
    customInstructions?: string;
    context?: string;
    ctaLink?: string;
    useAiGeneration?: boolean;
    templateText?: string;
  };
  dmConfig?: {
    useAiGeneration?: boolean;
    templateText?: string;
    context?: string;
    customInstructions?: string;
    ctaLink?: string;
    offer?: string;
  };
  rateLimits?: {
    maxPerHour?: number;
    maxPerDay?: number;
    delayBetweenRepliesSeconds?: number;
    currentHourCount?: number;
    currentDayCount?: number;
  };
  schedule?: {
    dueAt?: string;
    localDateTime?: string;
    startAt?: string;
    endAt?: string;
    timezone?: string;
    version?: number;
    activeDays?: string[];
    activeStartTime?: string;
    activeEndTime?: string;
  };
  totalTargets: number;
  totalReplies: number;
  totalSuccessful: number;
  totalFailed: number;
  totalSkipped: number;
  totalDmsSent: number;
  startedAt?: string;
  completedAt?: string;
  lastActivityAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Campaign model class
 */
export class OutreachCampaign implements ICampaign {
  id!: string;
  organizationId!: string;
  brandId?: string;
  userId?: string;
  credentialId!: string;
  label!: string;
  description?: string;
  platform!: CampaignPlatform;
  campaignType!: CampaignType;
  status!: CampaignStatus;
  discoveryConfig?: ICampaign['discoveryConfig'];
  aiConfig?: ICampaign['aiConfig'];
  dmConfig?: ICampaign['dmConfig'];
  rateLimits?: ICampaign['rateLimits'];
  schedule?: ICampaign['schedule'];
  totalTargets!: number;
  totalReplies!: number;
  totalSuccessful!: number;
  totalFailed!: number;
  totalSkipped!: number;
  totalDmsSent!: number;
  startedAt?: string;
  completedAt?: string;
  lastActivityAt?: string;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<ICampaign>) {
    Object.assign(this, partial);
  }
}

/**
 * Campaign serializer - identity transform
 */
const outreachCampaignSerializer: IServiceSerializer<OutreachCampaign> = {
  serialize: (data) => data,
};

/**
 * Campaign target model for frontend
 */
export interface CampaignTarget {
  id: string;
  organization: string;
  campaign: string;
  platform: CampaignPlatform;
  targetType: CampaignTargetType;
  externalId: string;
  contentUrl: string;
  authorUsername?: string;
  authorId?: string;
  contentText?: string;
  contentCreatedAt?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  discoverySource: string;
  relevanceScore: number;
  matchedKeyword?: string;
  status: string;
  scheduledAt?: string;
  processedAt?: string;
  replyText?: string;
  replyExternalId?: string;
  replyUrl?: string;
  errorMessage?: string;
  skipReason?: string;
  retryCount: number;
  recipientUsername?: string;
  recipientUserId?: string;
  dmText?: string;
  dmSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class OutreachCampaignsService extends BaseService<OutreachCampaign> {
  constructor(token: string) {
    super(
      '/outreach-campaigns',
      token,
      OutreachCampaign,
      outreachCampaignSerializer,
    );
  }

  public static getInstance(token: string): OutreachCampaignsService {
    return BaseService.getDataServiceInstance(OutreachCampaignsService, token);
  }

  /**
   * Get all campaigns for an organization
   */
  async findAllByOrganization(
    organizationId: string,
    brandId?: string,
  ): Promise<OutreachCampaign[]> {
    return this.findAllPages({
      ...(brandId ? { brandId } : {}),
      organizationId,
    });
  }

  /**
   * Get campaigns by status
   */
  async findByStatus(
    organizationId: string,
    status: CampaignStatus,
  ): Promise<OutreachCampaign[]> {
    return this.findAllPages({
      organizationId,
      status,
    });
  }

  /**
   * Start a campaign
   */
  async start(id: string): Promise<OutreachCampaign> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      { status: 'active' },
    );
    return new OutreachCampaign(
      this.extractResource<Partial<ICampaign>>(response.data),
    );
  }

  /**
   * Pause a campaign
   */
  async pause(id: string): Promise<OutreachCampaign> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      { status: 'paused' },
    );
    return new OutreachCampaign(
      this.extractResource<Partial<ICampaign>>(response.data),
    );
  }

  /**
   * Complete a campaign
   */
  async complete(id: string): Promise<OutreachCampaign> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      { status: 'completed' },
    );
    return new OutreachCampaign(
      this.extractResource<Partial<ICampaign>>(response.data),
    );
  }

  /**
   * Add targets to a campaign via URLs
   */
  async addTargets(
    id: string,
    urls: string[],
  ): Promise<{ added: number; skipped: number }> {
    const response = await this.instance.post<{
      added: number;
      skipped: number;
    }>(`/${id}/targets`, { urls });
    return response.data;
  }

  /**
   * Add DM recipients to a campaign by username
   */
  async addDmRecipients(
    id: string,
    usernames: string[],
  ): Promise<{ added: number; skipped: number }> {
    const response = await this.instance.post<{
      added: number;
      skipped: number;
    }>(`/${id}/targets`, {
      targetType: CampaignTargetType.DM_RECIPIENT,
      usernames,
    });
    return response.data;
  }

  /**
   * Parse a URL and get metadata
   */
  async parseUrl(url: string): Promise<{
    valid: boolean;
    platform?: CampaignPlatform;
    targetType?: CampaignTargetType;
    externalId?: string;
  }> {
    const response = await this.instance.post<{
      valid: boolean;
      platform?: CampaignPlatform;
      targetType?: CampaignTargetType;
      externalId?: string;
    }>('/parse-url', { url });
    return response.data;
  }

  /**
   * Get campaign analytics
   */
  async getAnalytics(id: string): Promise<{
    campaign: ICampaign;
    successRate: number;
    repliesPerHour: number;
    targetStats: {
      total: number;
      pending: number;
      scheduled: number;
      processing: number;
      replied: number;
      skipped: number;
      failed: number;
    };
  }> {
    const response = await this.instance.get<{
      campaign: ICampaign;
      successRate: number;
      repliesPerHour: number;
      targetStats: {
        total: number;
        pending: number;
        scheduled: number;
        processing: number;
        replied: number;
        skipped: number;
        failed: number;
      };
    }>(`/${id}/analytics`);
    return response.data;
  }

  /**
   * Get targets for a campaign
   */
  async getTargets(id: string): Promise<CampaignTarget[]> {
    const response = await this.instance.get<CampaignTarget[]>(
      `/${id}/targets`,
    );
    return response.data;
  }

  /**
   * Discover targets using AI-powered search
   */
  async discoverTargets(
    id: string,
    options: { limit?: number; addToCampaign?: boolean } = {},
  ): Promise<{
    discovered: number;
    added: number;
    targets: CampaignTarget[];
  }> {
    const response = await this.instance.post<{
      discovered: number;
      added: number;
      targets: CampaignTarget[];
    }>(`/${id}/targets/discover`, options);
    return response.data;
  }

  /**
   * Preview AI-generated reply for a target
   */
  async previewReply(
    campaignId: string,
    targetId: string,
  ): Promise<{
    replyText: string;
    target: CampaignTarget;
  }> {
    const response = await this.instance.post<{
      replyText: string;
      target: CampaignTarget;
    }>(`/${campaignId}/targets/${targetId}/preview`);
    return response.data;
  }
}
