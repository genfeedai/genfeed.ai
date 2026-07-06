import type { AgentToolResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { AdsClient } from '@mcp/services/client/ads.client';
import {
  AgentClient,
  type AgentRunListParams,
  type AgentRunResponse,
} from '@mcp/services/client/agent.client';
import { AnalyticsClient } from '@mcp/services/client/analytics.client';
import { BaseApiClient } from '@mcp/services/client/base-api-client';
import type {
  BrandResponse,
  CreateBatchParams,
  GeneratedApiRequest,
  ListBatchesParams,
  PersonaResponse,
} from '@mcp/services/client/client.types';
import {
  type AnalyzeClipProjectParams,
  ClipsClient,
  type CreateClipProjectFromYoutubeParams,
  type GenerateClipsParams,
  type ListClipProjectsParams,
} from '@mcp/services/client/clips.client';
import { ContentClient } from '@mcp/services/client/content.client';
import { LinkedInClient } from '@mcp/services/client/linkedin.client';
import { MediaClient } from '@mcp/services/client/media.client';
import {
  type SocialActionParams,
  type SocialConversationDetail,
  type SocialConversationListParams,
  type SocialConversationListResult,
  type SocialMessageListParams,
  SocialMessagesClient,
} from '@mcp/services/client/social-messages.client';
import { WorkflowClient } from '@mcp/services/client/workflow.client';
import { WorkspaceClient } from '@mcp/services/client/workspace.client';
import type {
  Analytics,
  OrganizationAnalytics,
} from '@mcp/shared/interfaces/analytics.interface';
import type {
  McpApprovalDecision,
  McpApprovalResource,
} from '@mcp/shared/interfaces/approval.interface';
import type {
  ArticleCreationParams,
  ArticleResponse,
  ArticleSearchParams,
  ArticleSearchResult,
} from '@mcp/shared/interfaces/article.interface';
import type {
  AvatarListParams,
  AvatarResponse,
} from '@mcp/shared/interfaces/avatar.interface';
import type {
  ImageCreationParams,
  ImageListParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicListParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  CreditsUsage,
  PostListParams,
  PostResponse,
  PublishContentParams,
  TrendingTopic,
  TrendingTopicsParams,
  UsageStats,
} from '@mcp/shared/interfaces/post.interface';
import type {
  VideoCreationParams,
  VideoResponse,
  VideoStatus,
} from '@mcp/shared/interfaces/video.interface';
import type {
  WorkflowCreateParams,
  WorkflowExecuteParams,
  WorkflowExecutionResult,
  WorkflowListParams,
  WorkflowResponse,
  WorkflowRunListParams,
  WorkflowRunResponse,
  WorkflowScheduleParams,
  WorkflowScheduleResponse,
  WorkflowTemplate,
} from '@mcp/shared/interfaces/workflow.interface';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

/**
 * Composition root for the MCP → Genfeed API client.
 *
 * The HTTP surface is decomposed into per-domain clients (media, content,
 * workflows, ads, analytics, workspace, agent, LinkedIn) that all
 * share a single {@link BaseApiClient} — and therefore a single axios instance,
 * so {@link setBearerToken} propagates to every sub-client. This class is a thin
 * aggregator: it owns no request logic and only delegates, preserving the exact
 * public method surface every MCP tool/resource consumes.
 */
@Injectable()
export class ClientService {
  private readonly base: BaseApiClient;
  private readonly agent: AgentClient;
  private readonly media: MediaClient;
  private readonly analytics: AnalyticsClient;
  private readonly content: ContentClient;
  private readonly clips: ClipsClient;
  private readonly workflows: WorkflowClient;
  private readonly workspace: WorkspaceClient;
  private readonly ads: AdsClient;
  private readonly socialMessages: SocialMessagesClient;
  // False positive below: the 14-char type name "LinkedInClient" next to the
  // `linkedin` identifier matches the default gitleaks linkedin-client-id rule.
  private readonly linkedin: LinkedInClient; // gitleaks:allow

  constructor(
    logger: LoggerService,
    httpService: HttpService,
    configService: ConfigService,
  ) {
    this.base = new BaseApiClient(logger, httpService, configService);
    this.agent = new AgentClient(this.base);
    this.media = new MediaClient(this.base);
    this.analytics = new AnalyticsClient(this.base);
    this.content = new ContentClient(this.base);
    this.clips = new ClipsClient(this.base);
    this.workflows = new WorkflowClient(this.base);
    this.workspace = new WorkspaceClient(this.base);
    this.ads = new AdsClient(this.base);
    this.socialMessages = new SocialMessagesClient(this.base);
    this.linkedin = new LinkedInClient(this.base);
  }

  setBearerToken(token: string): void {
    this.base.setBearerToken(token);
  }

  postAttributes<TResponse>(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<TResponse> {
    return this.base.postAttributes<TResponse>(endpoint, payload);
  }

  requestGeneratedOperation(request: GeneratedApiRequest): Promise<unknown> {
    return this.base.requestGeneratedOperation(request);
  }

  // ── Agent tools & approvals ──

  executeAgentTool(
    name: string,
    parameters: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    return this.agent.executeAgentTool(name, parameters, context);
  }

  createApproval(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.agent.createApproval(toolName, args);
  }

  getApproval(approvalId: string): Promise<McpApprovalResource | null> {
    return this.agent.getApproval(approvalId);
  }

  resolveApproval(
    approvalId: string,
    decision: McpApprovalDecision,
    result?: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.agent.resolveApproval(approvalId, decision, result);
  }

  attachApprovalResult(
    approvalId: string,
    result: Record<string, unknown>,
  ): Promise<McpApprovalResource> {
    return this.agent.attachApprovalResult(approvalId, result);
  }

  listAgentRuns(params: AgentRunListParams = {}): Promise<AgentRunResponse[]> {
    return this.agent.listAgentRuns(params);
  }

  getAgentRun(runId: string): Promise<AgentRunResponse> {
    return this.agent.getAgentRun(runId);
  }

  getAgentRunContent(runId: string): Promise<Record<string, unknown>> {
    return this.agent.getAgentRunContent(runId);
  }

  cancelAgentRun(runId: string): Promise<AgentRunResponse> {
    return this.agent.cancelAgentRun(runId);
  }

  // ── Media (video / image / avatar / music) ──

  createVideo(params: VideoCreationParams): Promise<VideoResponse> {
    return this.media.createVideo(params);
  }

  getVideoStatus(videoId: string): Promise<VideoStatus> {
    return this.media.getVideoStatus(videoId);
  }

  listVideos(limit: number = 10, offset: number = 0): Promise<VideoResponse[]> {
    return this.media.listVideos(limit, offset);
  }

  createImage(params: ImageCreationParams): Promise<ImageResponse> {
    return this.media.createImage(params);
  }

  listImages(params: ImageListParams = {}): Promise<ImageResponse[]> {
    return this.media.listImages(params);
  }

  listAvatars(params: AvatarListParams = {}): Promise<AvatarResponse[]> {
    return this.media.listAvatars(params);
  }

  createMusic(params: MusicCreationParams): Promise<MusicResponse> {
    return this.media.createMusic(params);
  }

  listMusic(params: MusicListParams = {}): Promise<MusicResponse[]> {
    return this.media.listMusic(params);
  }

  // ── Analytics ──

  getVideoAnalytics(
    videoId?: string,
    timeRange: string = '7d',
  ): Promise<Analytics> {
    return this.analytics.getVideoAnalytics(videoId, timeRange);
  }

  getOrganizationAnalytics(): Promise<OrganizationAnalytics> {
    return this.analytics.getOrganizationAnalytics();
  }

  // ── Content (articles / posts / trends) ──

  createArticle(params: ArticleCreationParams): Promise<ArticleResponse> {
    return this.content.createArticle(params);
  }

  searchArticles(params: ArticleSearchParams): Promise<ArticleSearchResult[]> {
    return this.content.searchArticles(params);
  }

  getArticle(articleId: string): Promise<ArticleResponse> {
    return this.content.getArticle(articleId);
  }

  publishContent(params: PublishContentParams): Promise<PostResponse[]> {
    return this.content.publishContent(params);
  }

  listPosts(params: PostListParams = {}): Promise<PostResponse[]> {
    return this.content.listPosts(params);
  }

  getTrendingTopics(
    params: TrendingTopicsParams = {},
  ): Promise<TrendingTopic[]> {
    return this.content.getTrendingTopics(params);
  }

  // ── Clip projects (analyze / factory / highlights / generate / read) ──

  analyzeClipProject(
    params: AnalyzeClipProjectParams,
  ): Promise<Record<string, unknown>> {
    return this.clips.analyzeClipProject(params);
  }

  createClipProjectFromYoutube(
    params: CreateClipProjectFromYoutubeParams,
  ): Promise<Record<string, unknown>> {
    return this.clips.createClipProjectFromYoutube(params);
  }

  getClipHighlights(projectId: string): Promise<Record<string, unknown>> {
    return this.clips.getClipHighlights(projectId);
  }

  getClipProject(projectId: string): Promise<Record<string, unknown>> {
    return this.clips.getClipProject(projectId);
  }

  generateClips(params: GenerateClipsParams): Promise<Record<string, unknown>> {
    return this.clips.generateClips(params);
  }

  listClipProjects(
    params: ListClipProjectsParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    return this.clips.listClipProjects(params);
  }

  // ── Workspace (credits / usage / brands / personas / batches / account / chat) ──

  getCredits(): Promise<CreditsUsage> {
    return this.workspace.getCredits();
  }

  getUsageStats(timeRange: string = '30d'): Promise<UsageStats> {
    return this.workspace.getUsageStats(timeRange);
  }

  listBrands(): Promise<BrandResponse[]> {
    return this.workspace.listBrands();
  }

  listPersonas(
    params: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<PersonaResponse[]> {
    return this.workspace.listPersonas(params);
  }

  createBatch(params: CreateBatchParams): Promise<Record<string, unknown>> {
    return this.workspace.createBatch(params);
  }

  listBatches(
    params: ListBatchesParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    return this.workspace.listBatches(params);
  }

  getAccountInfo(): Promise<Record<string, unknown>> {
    return this.workspace.getAccountInfo();
  }

  getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.workspace.getJobStatus(jobId);
  }

  createChat(): Promise<Record<string, unknown>> {
    return this.workspace.createChat();
  }

  sendChatMessage(
    threadId: string,
    message: string,
  ): Promise<Record<string, unknown>> {
    return this.workspace.sendChatMessage(threadId, message);
  }

  async retryAgentRun(
    runId: string,
    message?: string,
  ): Promise<Record<string, unknown>> {
    const run = await this.getAgentRun(runId);
    const threadId = this.resolveAgentRunThreadId(run);

    if (!threadId) {
      throw new Error('Agent run has no persisted thread to retry');
    }

    const retryMessage =
      message ??
      `Retry agent run ${runId}. Continue from the prior run context and explain what changed before taking action.`;

    return this.sendChatMessage(threadId, retryMessage);
  }

  private resolveAgentRunThreadId(run: AgentRunResponse): string | null {
    const thread = run.thread;
    if (typeof thread === 'string' && thread.length > 0) {
      return thread;
    }

    if (thread && typeof thread === 'object') {
      const threadRecord = thread as Record<string, unknown>;
      const id = threadRecord.id ?? threadRecord._id;
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }

    const metadata = run.metadata;
    if (metadata && typeof metadata === 'object') {
      const threadId = (metadata as Record<string, unknown>).threadId;
      if (typeof threadId === 'string' && threadId.length > 0) {
        return threadId;
      }
    }

    return null;
  }

  // ── Workflows ──

  createWorkflow(params: WorkflowCreateParams): Promise<WorkflowResponse> {
    return this.workflows.createWorkflow(params);
  }

  executeWorkflow(
    params: WorkflowExecuteParams,
  ): Promise<WorkflowExecutionResult> {
    return this.workflows.executeWorkflow(params);
  }

  getWorkflowStatus(workflowId: string): Promise<WorkflowResponse> {
    return this.workflows.getWorkflowStatus(workflowId);
  }

  inspectWorkflow(workflowId: string): Promise<WorkflowResponse> {
    return this.workflows.inspectWorkflow(workflowId);
  }

  duplicateWorkflow(workflowId: string): Promise<WorkflowResponse> {
    return this.workflows.duplicateWorkflow(workflowId);
  }

  setWorkflowSchedule(
    workflowId: string,
    params: WorkflowScheduleParams,
  ): Promise<WorkflowScheduleResponse> {
    return this.workflows.setWorkflowSchedule(workflowId, params);
  }

  listWorkflows(params: WorkflowListParams = {}): Promise<WorkflowResponse[]> {
    return this.workflows.listWorkflows(params);
  }

  listWorkflowRuns(
    params: WorkflowRunListParams = {},
  ): Promise<WorkflowRunResponse[]> {
    return this.workflows.listWorkflowRuns(params);
  }

  getWorkflowRun(runId: string): Promise<WorkflowRunResponse> {
    return this.workflows.getWorkflowRun(runId);
  }

  listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    return this.workflows.listWorkflowTemplates();
  }

  // ── Social Messages ──

  listSocialConversations(
    params: SocialConversationListParams = {},
  ): Promise<SocialConversationListResult> {
    return this.socialMessages.listConversations(params);
  }

  getSocialConversation(
    conversationId: string,
    options: { includeMessages?: boolean; limit?: number } = {},
  ): Promise<SocialConversationDetail> {
    return this.socialMessages.getConversationDetail(conversationId, options);
  }

  listSocialMessages(
    conversationId: string,
    params: SocialMessageListParams = {},
  ): Promise<Record<string, unknown>[]> {
    return this.socialMessages.listMessages(conversationId, params);
  }

  createSocialReplyDraft(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.createDraft(conversationId, params);
  }

  approveSocialDraft(
    conversationId: string,
    messageId: string,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.approveDraft(conversationId, messageId);
  }

  rejectSocialDraft(
    conversationId: string,
    messageId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.rejectDraft(conversationId, messageId, reason);
  }

  postSocialReply(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.postReply(conversationId, params);
  }

  sendSocialDm(
    conversationId: string,
    params: SocialActionParams,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.sendDm(conversationId, params);
  }

  updateSocialTags(
    conversationId: string,
    tags: string[],
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.updateTags(conversationId, tags);
  }

  assignSocialConversation(
    conversationId: string,
    assignedOwnerId?: string | null,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.assignConversation(
      conversationId,
      assignedOwnerId,
    );
  }

  markSocialConversationResolved(
    conversationId: string,
  ): Promise<Record<string, unknown>> {
    return this.socialMessages.markResolved(conversationId);
  }

  // ── Meta Ads ──

  listMetaAdAccounts(): Promise<unknown[]> {
    return this.ads.listMetaAdAccounts();
  }

  listMetaCampaigns(
    adAccountId: string,
    status?: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.ads.listMetaCampaigns(adAccountId, status, limit);
  }

  getMetaCampaignInsights(
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    return this.ads.getMetaCampaignInsights(
      campaignId,
      datePreset,
      since,
      until,
    );
  }

  getMetaAdSetInsights(adSetId: string, datePreset?: string): Promise<unknown> {
    return this.ads.getMetaAdSetInsights(adSetId, datePreset);
  }

  getMetaAdInsights(adId: string, datePreset?: string): Promise<unknown> {
    return this.ads.getMetaAdInsights(adId, datePreset);
  }

  listMetaAdCreatives(adAccountId: string, limit?: number): Promise<unknown[]> {
    return this.ads.listMetaAdCreatives(adAccountId, limit);
  }

  compareMetaCampaigns(
    campaignIds: string[],
    datePreset?: string,
  ): Promise<unknown> {
    return this.ads.compareMetaCampaigns(campaignIds, datePreset);
  }

  getMetaTopPerformers(
    adAccountId: string,
    metric: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.ads.getMetaTopPerformers(adAccountId, metric, limit);
  }

  // ── Google Ads ──

  listGoogleAdsCustomers(): Promise<unknown[]> {
    return this.ads.listGoogleAdsCustomers();
  }

  listGoogleAdsCampaigns(
    customerId: string,
    status?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.ads.listGoogleAdsCampaigns(
      customerId,
      status,
      limit,
      loginCustomerId,
    );
  }

  getGoogleAdsCampaignMetrics(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    segmentByDate?: boolean,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.ads.getGoogleAdsCampaignMetrics(
      customerId,
      campaignId,
      startDate,
      endDate,
      segmentByDate,
      loginCustomerId,
    );
  }

  getGoogleAdsAdGroupInsights(
    customerId: string,
    adGroupId: string,
    startDate?: string,
    endDate?: string,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.ads.getGoogleAdsAdGroupInsights(
      customerId,
      adGroupId,
      startDate,
      endDate,
      loginCustomerId,
    );
  }

  getGoogleAdsKeywordPerformance(
    customerId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.ads.getGoogleAdsKeywordPerformance(
      customerId,
      startDate,
      endDate,
      limit,
      loginCustomerId,
    );
  }

  getGoogleAdsSearchTerms(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.ads.getGoogleAdsSearchTerms(
      customerId,
      campaignId,
      startDate,
      endDate,
      limit,
      loginCustomerId,
    );
  }

  // ── LinkedIn ──

  generateLinkedInContent(params: {
    brandId?: string;
    topic: string;
    variationsCount?: number;
  }): Promise<
    Array<{
      body: string;
      content: string;
      cta: string;
      hashtags: string[];
      hook: string;
    }>
  > {
    return this.linkedin.generateLinkedInContent(params);
  }

  getLinkedInConnectionStatus(): Promise<{
    avatar: string | null;
    connected: boolean;
    handle: string | null;
    name: string | null;
    platform: string;
  }> {
    return this.linkedin.getLinkedInConnectionStatus();
  }

  getLinkedInAnalytics(
    contentId: string,
    timeRange: string = '7d',
  ): Promise<Record<string, unknown>> {
    return this.linkedin.getLinkedInAnalytics(contentId, timeRange);
  }
}
