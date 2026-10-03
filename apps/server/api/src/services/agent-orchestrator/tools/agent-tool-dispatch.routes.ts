import type { AgentAdsResearchToolHandler } from '@api/services/agent-orchestrator/tools/agent-ads-research-tool-handler.service';
import type { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import type { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import type { AgentBrandContextToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-context-tool-handler.service';
import type { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import type { AgentCampaignToolHandler } from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import type { AgentConnectionToolHandler } from '@api/services/agent-orchestrator/tools/agent-connection-tool-handler.service';
import type { AgentDashboardToolHandler } from '@api/services/agent-orchestrator/tools/agent-dashboard-tool-handler.service';
import type { AgentKnowledgeToolHandler } from '@api/services/agent-orchestrator/tools/agent-knowledge-tool-handler.service';
import type { AgentLivestreamToolHandler } from '@api/services/agent-orchestrator/tools/agent-livestream-tool-handler.service';
import type { AgentMediaGenerationToolHandler } from '@api/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service';
import type { AgentMemoryGoalsToolHandler } from '@api/services/agent-orchestrator/tools/agent-memory-goals-tool-handler.service';
import type { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import type { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import type { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { AgentQualityToolHandler } from '@api/services/agent-orchestrator/tools/agent-quality-tool-handler.service';
import type { AgentReviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-review-tool-handler.service';
import type { AgentSpawnToolHandler } from '@api/services/agent-orchestrator/tools/agent-spawn-tool-handler.service';
import type { AgentToolCatalogHandler } from '@api/services/agent-orchestrator/tools/agent-tool-catalog-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import type { AgentTrendsToolHandler } from '@api/services/agent-orchestrator/tools/agent-trends-tool-handler.service';
import type { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import type { AgentWorkspaceToolHandler } from '@api/services/agent-orchestrator/tools/agent-workspace-tool-handler.service';
import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export type AgentToolDispatchHandlers = {
  adsResearchHandler: AgentAdsResearchToolHandler;
  analyticsHandler: AgentAnalyticsToolHandler;
  brandContentHandler: AgentBrandContentToolHandler;
  brandContextHandler: AgentBrandContextToolHandler;
  brandInterviewHandler: AgentBrandInterviewToolHandler;
  campaignHandler: AgentCampaignToolHandler;
  catalogHandler: AgentToolCatalogHandler;
  connectionHandler: AgentConnectionToolHandler;
  dashboardHandler: AgentDashboardToolHandler;
  knowledgeHandler: AgentKnowledgeToolHandler;
  livestreamHandler: AgentLivestreamToolHandler;
  mediaGenerationHandler: AgentMediaGenerationToolHandler;
  memoryGoalsHandler: AgentMemoryGoalsToolHandler;
  onboardingHandler: AgentOnboardingToolHandler;
  prepareHandler: AgentPrepareToolHandler;
  proactiveHandler: AgentProactiveToolHandler;
  publishHandler: AgentPublishToolHandler;
  qualityHandler: AgentQualityToolHandler;
  reviewHandler: AgentReviewToolHandler;
  spawnHandler: AgentSpawnToolHandler;
  transferHandler?: AgentTransferToolHandler;
  trendsHandler: AgentTrendsToolHandler;
  workflowHandler: AgentWorkflowToolHandler;
  workspaceHandler: AgentWorkspaceToolHandler;
};

type FamilyResult = Promise<AgentToolResult> | AgentToolResult | null;

export function dispatchRegisteredAgentTool(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<AgentToolResult> {
  switch (toolName) {
    case 'create_brand_from_url':
      return handlers.brandContentHandler.createBrandFromUrl(params, ctx);
    case 'get_brand_scan_status':
      return handlers.brandContentHandler.getBrandScanStatus(params, ctx);
  }
  return Promise.resolve(
    dispatchCatalogAndTransfer(handlers, toolName, params, ctx) ??
      dispatchWorkspaceFamily(handlers, toolName, params, ctx) ??
      dispatchWorkflowFamily(handlers, toolName, params, ctx) ??
      dispatchInsightsFamily(handlers, toolName, params, ctx) ??
      dispatchMediaFamily(handlers, toolName, params, ctx) ??
      dispatchGrowthFamily(handlers, toolName, params, ctx) ??
      dispatchStudioFamily(handlers, toolName, params, ctx) ??
      dispatchKnowledgeFamily(handlers, toolName, params, ctx) ?? {
        creditsUsed: 0,
        error: `Unknown tool: ${toolName as string}`,
        success: false,
      },
  );
}

function dispatchCatalogAndTransfer(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'list_genfeed_tools':
      return handlers.catalogHandler.listGenfeedTools(params);
    case 'list_agent_conversations':
    case 'transfer_agent_conversation':
      return dispatchConversationTransfer(handlers, toolName, params, ctx);
    default:
      return null;
  }
}

function dispatchConversationTransfer(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<AgentToolResult> {
  if (!handlers.transferHandler) {
    return Promise.resolve({
      creditsUsed: 0,
      error: 'Conversation transfer tools are unavailable.',
      success: false,
    });
  }
  return toolName === 'list_agent_conversations'
    ? handlers.transferHandler.listConversations(params, ctx)
    : handlers.transferHandler.transfer(params, ctx);
}

function dispatchWorkspaceFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'get_account':
      return handlers.workspaceHandler.getAccount(params, ctx);
    case 'get_brands':
      return handlers.workspaceHandler.getBrands(params, ctx);
    case 'list_assets':
      return handlers.workspaceHandler.listAssets(params, ctx);
    case 'get_current_brand':
      return handlers.workspaceHandler.getCurrentBrand(ctx);
    case 'get_posts':
      return dispatchGetPosts(handlers, params, ctx);
    case 'request_media_upload':
      return handlers.workspaceHandler.requestMediaUpload(params, ctx);
    case 'complete_media_upload':
      return handlers.workspaceHandler.completeMediaUpload(params, ctx);
    case 'open_studio_handoff':
      return handlers.workspaceHandler.openStudioHandoff(params);
    case 'link_external_publication_credential':
      return handlers.publishHandler.linkExternalPublicationCredential(
        params,
        ctx,
      );
    case 'record_external_publication':
      return handlers.publishHandler.recordExternalPublication(params, ctx);
    case 'create_post':
      return handlers.publishHandler.createPost(params, ctx);
    case 'schedule_post':
      return handlers.publishHandler.schedulePost(params, ctx);
    case 'repurpose_post':
      return handlers.publishHandler.repurposePost(params, ctx);
    default:
      return null;
  }
}

/**
 * `get_posts` modes: `postId` opens one post (exclusive with every other
 * field), `days` reads the content calendar, otherwise recent posts are listed.
 */
function dispatchGetPosts(
  handlers: AgentToolDispatchHandlers,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<AgentToolResult> | AgentToolResult {
  const isSet = (key: string): boolean =>
    params[key] !== undefined && params[key] !== null && params[key] !== '';

  if (isSet('postId')) {
    const others = ['days', 'executionState', 'limit'].filter(isSet);
    if (others.length > 0) {
      return {
        creditsUsed: 0,
        error: `postId cannot be combined with ${others.join(', ')}.`,
        success: false,
      };
    }
    return handlers.workspaceHandler.getPost(params, ctx);
  }

  if (isSet('days')) {
    const others = ['executionState', 'limit'].filter(isSet);
    if (others.length > 0) {
      return {
        creditsUsed: 0,
        error: `days (content calendar) cannot be combined with ${others.join(', ')}.`,
        success: false,
      };
    }
    return handlers.proactiveHandler.getContentCalendar(params, ctx);
  }

  return handlers.workspaceHandler.listPosts(params, ctx);
}

function dispatchWorkflowFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'install_official_workflow':
      return handlers.workflowHandler.installOfficialWorkflow(params, ctx);
    case 'list_system_workflow_catalog':
      return handlers.workflowHandler.listSystemWorkflowCatalog(params, ctx);
    case 'install_system_workflow':
      return handlers.workflowHandler.installSystemWorkflow(params, ctx);
    case 'list_workflows':
      return handlers.workflowHandler.listWorkflows(params, ctx);
    case 'inspect_workflow':
      return handlers.workflowHandler.inspectWorkflow(params, ctx);
    case 'duplicate_workflow':
      return handlers.workflowHandler.duplicateWorkflow(params, ctx);
    case 'create_workflow':
      return handlers.workflowHandler.createWorkflow(params, ctx);
    case 'execute_workflow':
      return handlers.workflowHandler.executeWorkflow(params, ctx);
    case 'set_workflow_schedule':
      return handlers.workflowHandler.setWorkflowSchedule(params, ctx);
    case 'list_workflow_runs':
      return handlers.workflowHandler.listWorkflowRuns(params, ctx);
    case 'get_workflow_run':
      return handlers.workflowHandler.getWorkflowRun(params, ctx);
    case 'get_workflow_inputs':
      return handlers.workflowHandler.getWorkflowInputs(params, ctx);
    case 'create_livestream_bot':
      return handlers.livestreamHandler.createLivestreamBot(params, ctx);
    case 'manage_livestream_bot':
      return handlers.livestreamHandler.manageLivestreamBot(params, ctx);
    default:
      return null;
  }
}

function dispatchInsightsFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'get_analytics':
      return handlers.analyticsHandler.getAnalytics(params, ctx);
    case 'list_outlier_posts':
      return handlers.analyticsHandler.listOutlierPosts(params, ctx);
    case 'get_connection_status':
      return handlers.connectionHandler.getConnectionStatus(params, ctx);
    case 'initiate_oauth_connect':
      return handlers.connectionHandler.initiateOAuthConnect(params, ctx);
    case 'resolve_handle':
      return handlers.connectionHandler.resolveHandle(params, ctx);
    case 'connect_social_account':
      return handlers.connectionHandler.connectSocialAccount(params, ctx);
    case 'get_trends':
      return handlers.trendsHandler.getTrends(params, ctx);
    case 'list_ads_research':
      return handlers.adsResearchHandler.listAdsResearch(params, ctx);
    case 'get_ad_research_detail':
      return handlers.adsResearchHandler.getAdResearchDetail(params, ctx);
    case 'create_ad_remix_workflow':
      return handlers.adsResearchHandler.createAdRemixWorkflow(params, ctx);
    case 'generate_ad_pack':
      return handlers.adsResearchHandler.generateAdPack(params, ctx);
    case 'prepare_ad_launch_review':
      return handlers.adsResearchHandler.prepareAdLaunchReview(params, ctx);
    default:
      return null;
  }
}

function dispatchMediaFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'ai_action':
      return handlers.mediaGenerationHandler.aiAction(params, ctx);
    case 'generate_content':
      return handlers.mediaGenerationHandler.generateContent(params, ctx);
    case 'generate':
      return handlers.mediaGenerationHandler.generate(params, ctx);
    case 'transform_media':
      return handlers.mediaGenerationHandler.transformMedia(params, ctx);
    case 'generate_content_batch':
      return handlers.mediaGenerationHandler.generateContentBatch(params, ctx);
    case 'generate_as_identity':
      return handlers.mediaGenerationHandler.generateAsIdentity(params, ctx);
    default:
      return null;
  }
}

function dispatchGrowthFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'list_review_queue':
      return handlers.reviewHandler.listReviewQueue(params, ctx);
    case 'batch_approve_reject':
      return handlers.reviewHandler.batchApproveReject(params, ctx);
    case 'create_outreach_sequence':
      return handlers.campaignHandler.createCampaign(params, ctx);
    case 'start_outreach_sequence':
      return handlers.campaignHandler.startCampaign(params, ctx);
    case 'pause_outreach_sequence':
      return handlers.campaignHandler.pauseCampaign(params, ctx);
    case 'complete_outreach_sequence':
      return handlers.campaignHandler.completeCampaign(params, ctx);
    case 'get_outreach_sequence_analytics':
      return handlers.campaignHandler.getCampaignAnalytics(params, ctx);
    case 'create_brand':
      return handlers.onboardingHandler.createBrand(params, ctx);
    case 'rename_brand':
      return handlers.onboardingHandler.renameBrand(params, ctx);
    case 'check_onboarding_status':
      return handlers.onboardingHandler.checkOnboardingStatus(ctx);
    case 'complete_onboarding':
      return handlers.onboardingHandler.completeOnboarding(ctx);
    case 'generate_onboarding_content':
      return handlers.onboardingHandler.generateOnboardingContent(params, ctx);
    case 'present_payment_options':
      return handlers.onboardingHandler.presentPaymentOptions(ctx);
    case 'generate_monthly_content':
      return handlers.brandContentHandler.generateMonthlyContent(params, ctx);
    case 'draft_brand_voice_profile':
      return handlers.brandContentHandler.draftBrandVoiceProfile(params, ctx);
    case 'save_brand_voice_profile':
      return handlers.brandContentHandler.saveBrandVoiceProfile(params, ctx);
    case 'discover_engagements':
      return handlers.proactiveHandler.discoverEngagements(params, ctx);
    case 'draft_engagement_reply':
      return handlers.proactiveHandler.draftEngagementReply(params, ctx);
    case 'get_approval_summary':
      return handlers.proactiveHandler.getApprovalSummary(ctx);
    case 'analyze_performance':
      return handlers.proactiveHandler.analyzePerformance(params, ctx);
    case 'update_strategy_state':
      return handlers.proactiveHandler.updateStrategyState(params, ctx);
    default:
      return null;
  }
}

function dispatchStudioFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'render_dashboard':
      return handlers.dashboardHandler.renderDashboard(params, ctx);
    case 'save_dashboard_layout':
      return handlers.dashboardHandler.saveDashboardLayout(params, ctx);
    case 'get_dashboard_layout':
      return handlers.dashboardHandler.getDashboardLayout(params, ctx);
    case 'prepare_generation':
      return handlers.prepareHandler.prepareGeneration(params, ctx);
    case 'prepare_workflow_trigger':
      return handlers.prepareHandler.prepareWorkflowTrigger(params, ctx);
    case 'prepare_voice_clone':
      return handlers.prepareHandler.prepareVoiceClone(ctx, params);
    case 'prepare_clip_workflow_run':
      return handlers.prepareHandler.prepareClipWorkflowRun(params, ctx);
    case 'suggest_next_steps':
      return handlers.prepareHandler.suggestNextSteps(params);
    case 'suggest_ingredient_alternatives':
      return handlers.qualityHandler.suggestIngredientAlternatives(params);
    case 'select_ingredient':
      return handlers.qualityHandler.selectIngredient(params, ctx);
    case 'rate_content':
      return handlers.qualityHandler.rateContent(params, ctx);
    case 'score_seo':
      return handlers.qualityHandler.scoreSeo(params, ctx);
    case 'rate_ingredient':
      return handlers.qualityHandler.rateIngredient(params, ctx);
    case 'get_top_ingredients':
      return handlers.qualityHandler.getTopIngredients(params, ctx);
    case 'replicate_top_ingredient':
      return handlers.qualityHandler.replicateTopIngredient(params, ctx);
    case 'spawn_content_agent':
      return handlers.spawnHandler.spawnContentAgent(params, ctx);
    case 'request_asset':
      return handlers.spawnHandler.requestAsset(params, ctx);
    case 'capture_memory':
      return handlers.memoryGoalsHandler.captureMemory(params, ctx);
    case 'create_goal':
      return handlers.memoryGoalsHandler.createGoal(params, ctx);
    case 'check_goal_progress':
      return handlers.memoryGoalsHandler.checkGoalProgress(params, ctx);
    case 'update_goal':
      return handlers.memoryGoalsHandler.updateGoal(params, ctx);
    default:
      return null;
  }
}

function dispatchKnowledgeFamily(
  handlers: AgentToolDispatchHandlers,
  toolName: CuratedActionName,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): FamilyResult {
  switch (toolName) {
    case 'search_knowledge':
    case 'list_knowledge_sources':
    case 'read_knowledge_source':
    case 'capture_knowledge':
    case 'assign_knowledge_purpose':
    case 'archive_knowledge_source':
    case 'retry_knowledge_ingestion':
      return handlers.knowledgeHandler.execute(toolName, params, ctx);
    case 'start_brand_interview':
    case 'submit_brand_interview_answer':
    case 'skip_brand_interview_question':
    case 'get_brand_completeness':
      return handlers.brandInterviewHandler.execute(toolName, params, ctx);
    case 'get_brand_context':
      return handlers.brandContextHandler.execute(toolName, params, ctx);
    default:
      return null;
  }
}
