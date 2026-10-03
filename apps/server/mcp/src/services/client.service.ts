import { storyboardCharacterReplacementSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import { storyboardRunSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { storyboardRunCapabilitiesSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import type {
  AgentToolResult,
  AgentUntrustedContentGateResult,
  IPublishingProviderReadiness,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type {
  ArticleDraftInput,
  ArticlePreviewLink,
} from '@genfeedai/contracts/interfaces/content/article-publishing.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { AdsClient } from '@mcp/services/client/ads.client';
import { AgentClient } from '@mcp/services/client/agent.client';
import { AnalyticsClient } from '@mcp/services/client/analytics.client';
import { BaseApiClient } from '@mcp/services/client/base-api-client';
import type {
  AdsGatewayInsightsParams,
  CreateBatchParams,
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
import {
  EditorClient,
  type OpenInEditorParams,
} from '@mcp/services/client/editor.client';
import { LinkedInClient } from '@mcp/services/client/linkedin.client';
import type { LinkedInConnectionStatus } from '@mcp/services/client/linkedin.client.types';
import { MediaClient } from '@mcp/services/client/media.client';
import { RemixClient } from '@mcp/services/client/remix.client';
import {
  type ScheduledReleaseControlAction,
  type SchedulerCapabilityListOptions,
  SchedulerClient,
  type ValidateSchedulerTargetInput,
} from '@mcp/services/client/scheduler.client';
import { SkillsProClient } from '@mcp/services/client/skills-pro.client';
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
  ArticleResponse,
  ArticleSearchParams,
  ArticleSearchResult,
} from '@mcp/shared/interfaces/article.interface';
import type {
  ImageCreationParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  CreditsUsage,
  PostListParams,
  PostResponse,
  PublishContentParams,
  TrendingTopic,
  TrendingTopicsParams,
} from '@mcp/shared/interfaces/post.interface';
import type {
  SkillsProEntitlement,
  SkillsProInstallation,
} from '@mcp/shared/interfaces/skills-pro.interface';
import type {
  VideoCreationParams,
  VideoResponse,
} from '@mcp/shared/interfaces/video.interface';
import type {
  SystemWorkflowCatalogEntry,
  SystemWorkflowCatalogListParams,
  SystemWorkflowInstallParams,
  WorkflowCreateParams,
  WorkflowListParams,
  WorkflowResponse,
  WorkflowRunListParams,
  WorkflowRunResponse,
  WorkflowScheduleParams,
  WorkflowScheduleResponse,
  WorkflowTemplate,
} from '@mcp/shared/interfaces/workflow.interface';
import type { RemixToolInput } from '@mcp/tools/remix.schemas';
import {
  type StoryboardToolInput,
  storyboardToolSchemas,
} from '@mcp/tools/storyboard.schemas';
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
  private readonly editor: EditorClient;
  private readonly scheduler: SchedulerClient;
  private readonly remix: RemixClient;
  private readonly workflows: WorkflowClient;
  private readonly workspace: WorkspaceClient;
  private readonly ads: AdsClient;
  private readonly socialMessages: SocialMessagesClient;
  private readonly skillsPro: SkillsProClient;
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
    this.editor = new EditorClient(this.base);
    this.scheduler = new SchedulerClient(this.base);
    this.remix = new RemixClient(this.base);
    this.workflows = new WorkflowClient(this.base);
    this.workspace = new WorkspaceClient(this.base);
    this.ads = new AdsClient(this.base);
    this.socialMessages = new SocialMessagesClient(this.base);
    this.skillsPro = new SkillsProClient(this.base);
    this.linkedin = new LinkedInClient(this.base);
  }

  setBearerToken(token: string): void {
    this.base.setBearerToken(token);
  }

  // ── Skills Pro entitlements ──

  verifySkillsProEntitlement(receiptId: string): Promise<SkillsProEntitlement> {
    return this.skillsPro.verifyEntitlement(receiptId);
  }

  installSkillsProSkill(
    receiptId: string,
    skillSlug: string,
  ): Promise<SkillsProInstallation> {
    return this.skillsPro.installSkill(receiptId, skillSlug);
  }

  createScopedSkill(body: Record<string, unknown>) {
    return this.skillsPro.createScopedSkill(body);
  }

  forkSkill(skillId: string) {
    return this.skillsPro.forkSkill(skillId);
  }

  exportSkill(skillId: string) {
    return this.skillsPro.exportSkill(skillId);
  }

  publishSkill(skillId: string, audience: 'organization' | 'public') {
    return this.skillsPro.publishSkill(skillId, audience);
  }

  archiveSkill(skillId: string) {
    return this.skillsPro.archiveSkill(skillId);
  }

  rollbackSkill(skillId: string, versionId: string) {
    return this.skillsPro.rollbackSkill(skillId, versionId);
  }

  postAttributes<TResponse>(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<TResponse> {
    return this.base.postAttributes<TResponse>(endpoint, payload);
  }

  // ── Agent tools & approvals ──

  evaluateMcpToolResult(
    name: string,
    content: string,
    isPartial = false,
  ): Promise<AgentUntrustedContentGateResult> {
    return this.agent.evaluateMcpToolResult(name, content, isPartial);
  }

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

  // ── Media (video / image / avatar / music) ──

  createVideo(params: VideoCreationParams): Promise<VideoResponse> {
    return this.media.createVideo(params);
  }

  }

  createImage(params: ImageCreationParams): Promise<ImageResponse> {
    return this.media.createImage(params);
  }

  createMusic(params: MusicCreationParams): Promise<MusicResponse> {
    return this.media.createMusic(params);
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

  createArticleDraft(params: ArticleDraftInput): Promise<ArticleResponse> {
    return this.content.createArticleDraft(params);
  }

  getArticlePreview(articleId: string): Promise<ArticlePreviewLink> {
    return this.content.getArticlePreview(articleId);
  }

  publishArticle(articleId: string): Promise<ArticleResponse> {
    return this.content.publishArticle(articleId);
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

  openInEditor(params: OpenInEditorParams): Promise<Record<string, unknown>> {
    return this.editor.openInEditor(params);
  }

  importSourcePost(input: RemixToolInput<'import_source_post'>) {
    return this.remix.importSourcePost(input);
  }
  createRemixConcept(input: RemixToolInput<'create_remix_concept'>) {
    return this.remix.createRemixConcept(input);
  }
  createStoryboardRemix(input: StoryboardToolInput<'create_storyboard_remix'>) {
    const { assetId, brandId, clientRequestId } =
      storyboardToolSchemas.create_storyboard_remix.parse(input);
    return this.base.request(
      'creating a storyboard remix',
      async (http) => {
        const response = await http.post(
          `/brands/${encodeURIComponent(brandId)}/storyboard-runs`,
          {
            clientRequestId,
            source: { kind: 'uploaded_video', assetId },
          },
        );
        const resource =
          this.base.unwrapObject<Record<string, unknown>>(response);
        const attributes = storyboardRecord(resource.attributes);
        return storyboardRunSchema.parse({
          ...attributes,
          ...(typeof resource.id === 'string' ? { id: resource.id } : {}),
        });
      },
      this.base.failWithDetail('Failed to create a storyboard remix'),
    );
  }

  replaceStoryboardCharacter(
    input: StoryboardToolInput<'replace_storyboard_character'>,
  ) {
    const { brandId, imageAssetIds, prompt, runId, shotId } =
      storyboardToolSchemas.replace_storyboard_character.parse(input);
    return this.base.request(
      'replacing a storyboard character',
      async (http) => {
        const response = await http.post(
          `/brands/${encodeURIComponent(brandId)}/storyboard-runs/${encodeURIComponent(runId)}/shots/${encodeURIComponent(shotId)}/character-replacement`,
          {
            imageAssetIds,
            ...(prompt === undefined ? {} : { prompt }),
          },
        );
        return storyboardCharacterReplacementSchema.parse(response.data);
      },
      this.base.failWithDetail('Failed to replace the storyboard character'),
    );
  }

  getStoryboardRunCapabilities(
    input: StoryboardToolInput<'storyboard_run_capabilities'>,
  ) {
    const { brandId, runId } =
      storyboardToolSchemas.storyboard_run_capabilities.parse(input);
    return this.base.request(
      'reading storyboard model capabilities',
      async (http) => {
        const response = await http.get(
          `/brands/${encodeURIComponent(brandId)}/storyboard-runs/${encodeURIComponent(runId)}/capabilities`,
        );
        return storyboardRunCapabilitiesSchema.parse(response.data);
      },
      this.base.failWithDetail('Failed to read storyboard model capabilities'),
    );
  }

  getRemixRun(input: RemixToolInput<'get_remix_run'>) {
    return this.remix.getRemixRun(input);
  }
  updateRemixConcept(input: RemixToolInput<'update_remix_concept'>) {
    return this.remix.updateRemixConcept(input);
  }
  attachRemixAnalysisSource(
    input: RemixToolInput<'attach_remix_analysis_source'>,
  ) {
    return this.remix.attachRemixAnalysisSource(input);
  }
  quoteRemixGeneration(input: RemixToolInput<'quote_remix_generation'>) {
    return this.remix.quoteRemixGeneration(input);
  }
  startRemixGeneration(input: RemixToolInput<'start_remix_generation'>) {
    return this.remix.startRemixGeneration(input);
  }
  controlRemixGeneration(input: RemixToolInput<'control_remix_generation'>) {
    return this.remix.controlRemixGeneration(input);
  }

  // ── Scheduler releases ──

  createScheduledRelease(
    release: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<IReleaseGroup> {
    return this.scheduler.createScheduledRelease(release, idempotencyKey);
  }

  getScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
    return this.scheduler.getScheduledRelease(releaseId);
  }

  updateScheduledRelease(
    releaseId: string,
    changes: Record<string, unknown>,
    targetId?: string,
  ): Promise<IReleaseGroup> {
    return this.scheduler.updateScheduledRelease(releaseId, changes, targetId);
  }

  controlScheduledRelease(
    releaseId: string,
    action: ScheduledReleaseControlAction,
  ): Promise<IReleaseGroup> {
    return this.scheduler.controlScheduledRelease(releaseId, action);
  }

  listSchedulerCapabilities(
    options: SchedulerCapabilityListOptions = {},
  ): Promise<Array<Record<string, unknown>>> {
    return this.scheduler.listSchedulerCapabilities(options);
  }

  listBrandPublishingReadiness(
    brandId: string,
  ): Promise<IPublishingProviderReadiness[]> {
    return this.scheduler.listBrandPublishingReadiness(brandId);
  }

  getSchedulerCapability(platform: string): Promise<Record<string, unknown>> {
    return this.scheduler.getSchedulerCapability(platform);
  }

  validateSchedulerTarget(
    input: ValidateSchedulerTargetInput,
  ): Promise<Record<string, unknown>> {
    return this.scheduler.validateSchedulerTarget(input);
  }

  // ── Workspace (credits / usage / brands / personas / batches / account / chat) ──

  getCredits(): Promise<CreditsUsage> {
    return this.workspace.getCredits();
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

  // ── Workflows ──

  createWorkflow(params: WorkflowCreateParams): Promise<WorkflowResponse> {
    return this.workflows.createWorkflow(params);
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

  listSystemWorkflowCatalog(
    params: SystemWorkflowCatalogListParams = {},
  ): Promise<SystemWorkflowCatalogEntry[]> {
    return this.workflows.listSystemWorkflowCatalog(params);
  }

  installSystemWorkflow(
    params: SystemWorkflowInstallParams,
  ): Promise<WorkflowResponse> {
    return this.workflows.installSystemWorkflow(params);
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

  // ── TikTok Ads ──

  listTikTokAdAccounts(credentialId: string): Promise<unknown[]> {
    return this.ads.listTikTokAdAccounts(credentialId);
  }

  listTikTokCampaigns(
    credentialId: string,
    adAccountId: string,
  ): Promise<unknown[]> {
    return this.ads.listTikTokCampaigns(credentialId, adAccountId);
  }

  getTikTokCampaignInsights(
    credentialId: string,
    adAccountId: string,
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    return this.ads.getTikTokCampaignInsights(
      credentialId,
      adAccountId,
      campaignId,
      datePreset,
      since,
      until,
    );
  }

  getTikTokTopPerformers(
    credentialId: string,
    adAccountId: string,
    metric?: string,
    limit?: number,
    datePreset?: string,
  ): Promise<unknown[]> {
    return this.ads.getTikTokTopPerformers(
      credentialId,
      adAccountId,
      metric,
      limit,
      datePreset,
    );
  }

  listTikTokAdGroups(
    credentialId: string,
    adAccountId: string,
    campaignId: string,
  ): Promise<unknown[]> {
    return this.ads.listTikTokAdGroups(credentialId, adAccountId, campaignId);
  }

  listTikTokAds(
    credentialId: string,
    adAccountId: string,
    adGroupId?: string,
  ): Promise<unknown[]> {
    return this.ads.listTikTokAds(credentialId, adAccountId, adGroupId);
  }

  // ── Ads gateway (platform-generic) ──

  getAdsAdSetInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.ads.getAdsAdSetInsights(params);
  }

  getAdsAdInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.ads.getAdsAdInsights(params);
  }

  // ── LinkedIn ──

  getLinkedInConnectionStatus(): Promise<LinkedInConnectionStatus> {
    return this.linkedin.getLinkedInConnectionStatus();
  }

  getLinkedInAnalytics(
    contentId: string,
    timeRange: string = '7d',
  ): Promise<Record<string, unknown>> {
    return this.linkedin.getLinkedInAnalytics(contentId, timeRange);
  }
}

function storyboardRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}
