import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import {
  AD_BULK_UPLOAD_ACTION_IDS,
  AdBulkUploadWorkflowService,
} from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import {
  AUTOMATION_ACTION_IDS,
  AUTOMATION_WORKFLOW_IDS,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { PaidCreativeResearchWorkflowService } from '@api/collections/workflows/services/paid-creative-research-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { AD_AUTOMATION_ACTION_IDS } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { ANALYTICS_SYNC_ACTION_IDS } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import {
  buildActionExecutionInput,
  type ExecutionContext,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class WorkflowAutomationExecutorRegistrarService {
  constructor(
    @Optional()
    private readonly adAutomationWorkflowService?: AdAutomationWorkflowService,
    @Optional()
    private readonly agentAutopilotWorkflowService?: AgentAutopilotWorkflowService,
    @Optional()
    private readonly analyticsSyncWorkflowService?: AnalyticsSyncWorkflowService,
    @Optional()
    private readonly contentProductionWorkflowService?: ContentProductionWorkflowService,
    @Optional()
    private readonly replyPollingWorkflowService?: ReplyPollingWorkflowService,
    @Optional()
    private readonly trendNotificationWorkflowService?: TrendNotificationWorkflowService,
    @Optional()
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
    @Optional()
    private readonly winnerPromotionWorkflowService?: WinnerPromotionWorkflowService,
    @Optional()
    private readonly paidCreativeResearchWorkflowService?: PaidCreativeResearchWorkflowService,
    @Optional()
    private readonly adBulkUploadWorkflowService?: AdBulkUploadWorkflowService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerAdAutomationExecutors(engine);
    this.registerAdBulkUploadExecutors(engine);
    this.registerAgentAutopilotExecutors(engine);
    this.registerAnalyticsSyncExecutors(engine);
    this.registerContentProductionExecutors(engine);
    this.registerReplyPollingExecutors(engine);
    this.registerTrendNotificationExecutors(engine);
    this.registerLivestreamBotExecutors(engine);
    this.registerWinnerPromotionExecutors(engine);
    this.registerPaidCreativeResearchExecutors(engine);
  }

  private registerAdAutomationExecutors(engine: WorkflowEngine): void {
    const service = this.adAutomationWorkflowService;
    if (!service) {
      return;
    }
    const registrations = [
      [
        AD_AUTOMATION_ACTION_IDS.DISCOVER_CREDENTIALS,
        service.discoverCredentials.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.GOOGLE_FETCH,
        service.fetchGoogle.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.GOOGLE_NORMALIZE,
        service.normalizeGoogle.bind(service),
      ],
      [AD_AUTOMATION_ACTION_IDS.META_FETCH, service.fetchMeta.bind(service)],
      [
        AD_AUTOMATION_ACTION_IDS.META_NORMALIZE,
        service.normalizeMeta.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_ANALYZE,
        service.analyzeOptimization.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_FINALIZE,
        service.finalizeOptimization.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_LOAD_CONFIG,
        service.loadOptimizationConfig.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.OPTIMIZATION_PERSIST,
        service.persistOptimizationRecommendations.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.PERSIST_PERFORMANCE,
        service.persistPerformance.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.TIKTOK_FETCH,
        service.fetchTikTok.bind(service),
      ],
      [
        AD_AUTOMATION_ACTION_IDS.TIKTOK_NORMALIZE,
        service.normalizeTikTok.bind(service),
      ],
    ] as const;

    for (const [actionId, execute] of registrations) {
      engine.registerExecutor(actionId, (node, inputs, context) =>
        execute(context.organizationId, actionInputs(node.config, inputs)),
      );
    }
  }

  private registerAdBulkUploadExecutors(engine: WorkflowEngine): void {
    const service = this.adBulkUploadWorkflowService;
    if (!service) {
      return;
    }
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.CLAIM,
      (node, inputs, context) =>
        service.claim(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.BUILD_MEDIA_ITEMS,
      async (node, inputs) =>
        service.buildMediaItems(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.UPLOAD_MEDIA,
      (node, inputs, context) =>
        service.uploadMedia(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.BUILD_PERMUTATIONS,
      async (node, inputs) =>
        service.buildPermutations(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.CREATE_AD,
      (node, inputs, context) =>
        service.createAd(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.FINALIZE,
      (node, inputs, context) =>
        service.finalize(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AD_BULK_UPLOAD_ACTION_IDS.FAIL,
      (node, inputs, context) =>
        service.fail(context.organizationId, actionInputs(node.config, inputs)),
    );
  }

  private registerAgentAutopilotExecutors(engine: WorkflowEngine): void {
    const service = this.agentAutopilotWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_BEGIN,
      (_node, _inputs, context) =>
        service.beginProactiveStrategies(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_DISCOVER_RESETS,
      (node, inputs, context) =>
        service.discoverCreditResetStrategies(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_RESET,
      (node, inputs, context) =>
        service.resetCreditWindow(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_DISCOVER,
      (node, inputs, context) =>
        service.discoverProactiveStrategies(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_DISPATCH,
      (node, inputs, context) =>
        service.dispatchProactiveStrategy(
          actionInputs(node.config, inputs),
          workflowContext(context, node),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_FINALIZE,
      (node, inputs, context) =>
        service.finalizeProactiveStrategies(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.AGENT_FAIL,
      (node, inputs, context) =>
        service.failProactiveStrategies(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerAnalyticsSyncExecutors(engine: WorkflowEngine): void {
    const service = this.analyticsSyncWorkflowService;
    if (!service) {
      return;
    }
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.DISCOVER_POSTS,
      (node, inputs, context) =>
        service.discoverPosts(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.FACEBOOK_COLLECT,
      (node, inputs) =>
        service.collectFacebook(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.SOCIAL_COLLECT,
      (node, inputs) =>
        service.collectSocial(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.THREADS_COLLECT,
      (node, inputs) =>
        service.collectThreads(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.TWITTER_COLLECT,
      (node, inputs) =>
        service.collectTwitter(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.YOUTUBE_COLLECT,
      (node, inputs) =>
        service.collectYouTube(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.FINALIZE_COLLECTION,
      async (node, inputs) =>
        service.finalizeCollection(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_RESOLVE_WINDOW,
      (node, inputs, context) =>
        service.resolveGenericWindow(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_DISCOVER,
      (node, inputs, context) =>
        service.discoverGeneric(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_PERSIST,
      (node, inputs, context) =>
        service.persistGeneric(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_SYNC_MEMORY,
      (node, inputs, context) =>
        service.syncGenericMemory(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      ANALYTICS_SYNC_ACTION_IDS.GENERIC_DETECT_ALERTS,
      (node, inputs, context) =>
        service.detectGenericAlerts(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerContentProductionExecutors(engine: WorkflowEngine): void {
    const service = this.contentProductionWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_BEGIN,
      (_node, _inputs, context) =>
        service.beginContentEngineProduction(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_DISCOVER,
      (node, inputs, context) =>
        service.discoverContentEngineBrands(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN,
      (node, inputs, context) =>
        service.planContentEngineBrand(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN_PREPARE,
      (node, inputs, context) =>
        service.prepareContentEnginePlanExecution(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_EXECUTE_ITEM,
      (node, inputs, context) =>
        service.executeContentEnginePlanItem(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_PLAN_FINALIZE,
      (node, inputs, context) =>
        service.finalizeContentEnginePlan(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_FINALIZE,
      (node, inputs, context) =>
        service.finalizeContentProduction(
          AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_ENGINE_FAIL,
      (node, inputs, context) =>
        service.failContentProduction(
          AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_BEGIN,
      (_node, _inputs, context) =>
        service.beginContentPipelineAutopilot(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_DISCOVER,
      (node, inputs, context) =>
        service.discoverContentPipelinePersonas(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_PREPARE,
      (node, inputs) =>
        service.prepareContentPipelinePersona(
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_SCHEDULE,
      (node, inputs) =>
        service.scheduleContentPipelinePersona(
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_FINALIZE,
      (node, inputs, context) =>
        service.finalizeContentProduction(
          AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.CONTENT_PIPELINE_FAIL,
      (node, inputs, context) =>
        service.failContentProduction(
          AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerReplyPollingExecutors(engine: WorkflowEngine): void {
    const service = this.replyPollingWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_BEGIN,
      (_node, _inputs, context) =>
        service.beginReplyBotPolling(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_DISCOVER,
      (node, inputs, context) =>
        service.discoverReplyBotTargets(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_PREPARE,
      async (node, inputs, context) =>
        service.prepareReplyBotTarget(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_FINALIZE_TARGET,
      async (node, inputs) =>
        service.finalizeReplyBotTarget(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_FINALIZE,
      (node, inputs, context) =>
        service.finalizePolling(
          AUTOMATION_WORKFLOW_IDS.REPLY_BOTS,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.REPLY_FAIL,
      (node, inputs, context) =>
        service.failPolling(
          AUTOMATION_WORKFLOW_IDS.REPLY_BOTS,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.SOCIAL_BEGIN,
      (_node, _inputs, context) =>
        service.beginSocialTriggerPolling(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.SOCIAL_DISCOVER,
      (node, inputs, context) =>
        service.discoverSocialTriggerWorkflows(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.SOCIAL_PROCESS,
      (node, inputs) =>
        service.processSocialTriggerWorkflow(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.SOCIAL_FINALIZE,
      (node, inputs, context) =>
        service.finalizePolling(
          AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGERS,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.SOCIAL_FAIL,
      (node, inputs, context) =>
        service.failPolling(
          AUTOMATION_WORKFLOW_IDS.SOCIAL_TRIGGERS,
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerTrendNotificationExecutors(engine: WorkflowEngine): void {
    const service = this.trendNotificationWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_PREPARE,
      (node, inputs, context) => {
        const actionInput = actionInputs(node.config, inputs);
        const request =
          actionInput.request && typeof actionInput.request === 'object'
            ? (actionInput.request as Record<string, unknown>)
            : {};
        const cadence = request.cadence;
        if (cadence !== 'hourly' && cadence !== 'daily' && cadence !== 'weekly')
          throw new Error('cadence must be hourly, daily, or weekly');
        return service.prepareTrendSummaryNotifications(
          context.organizationId,
          cadence,
        );
      },
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_READ_VIDEOS,
      (node, inputs) =>
        service.readTrendSummaryVideos(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_READ_HASHTAGS,
      (node, inputs) =>
        service.readTrendSummaryHashtags(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_READ_SOUNDS,
      (node, inputs) =>
        service.readTrendSummarySounds(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_RENDER,
      (node, inputs) =>
        service.renderTrendSummaryNotifications(
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_TELEGRAM,
      (node, inputs) =>
        service.deliverTrendSummaryChannel(
          'telegram',
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_EMAIL,
      (node, inputs) =>
        service.deliverTrendSummaryChannel(
          'email',
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_DELIVER_IN_APP,
      (node, inputs) =>
        service.deliverTrendSummaryChannel(
          'inApp',
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.TRENDS_FINALIZE,
      async (node, inputs, context) =>
        service.finalizeTrendSummaryNotifications(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerLivestreamBotExecutors(engine: WorkflowEngine): void {
    const service = this.livestreamBotWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_BEGIN,
      (_node, _inputs, context) =>
        service.beginActiveSessionProcessing(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_DISCOVER,
      (node, inputs, context) =>
        service.discoverActiveSessions(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_LOAD,
      (node, inputs, context) =>
        service.loadActiveSession(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_SYNC_RESTREAM,
      (node, inputs) =>
        service.syncActiveSessionRestream(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_DISCOVER_TARGETS,
      async (node, inputs) =>
        service.discoverActiveSessionTargets(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_TARGET_DELIVER,
      (node, inputs, context) =>
        service.deliverActiveSessionTarget(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_SESSION_FINALIZE,
      async (node, inputs) =>
        service.finalizeActiveSession(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_FINALIZE,
      (node, inputs, context) =>
        service.finalizeActiveSessionProcessing(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.LIVESTREAM_FAIL,
      (node, inputs, context) =>
        service.failActiveSessionProcessing(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.RESTREAM_LOAD,
      (node, inputs, context) =>
        service.loadRestreamBot(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.RESTREAM_SYNC,
      (node, inputs) =>
        service.syncRestreamChat(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.RESTREAM_FINALIZE,
      async (node, inputs, context) =>
        service.finalizeRestreamChat(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerWinnerPromotionExecutors(engine: WorkflowEngine): void {
    const service = this.winnerPromotionWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_BEGIN,
      (_node, _inputs, context) =>
        service.beginOrganizationWinnerPromotion(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_DISCOVER,
      (node, inputs, context) =>
        service.discoverEligibleWinnerBrands(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_PREPARE_BRAND,
      (node, inputs, context) =>
        service.prepareBrandWinners(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_PROMOTE_ITEM,
      (node, inputs, context) =>
        service.promoteWinnerItem(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_FINALIZE_BRAND,
      async (node, inputs) =>
        service.finalizeBrandWinners(actionInputs(node.config, inputs)),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_FINALIZE,
      (node, inputs, context) =>
        service.finalizeOrganizationWinnerPromotion(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.HARNESS_FAIL,
      (node, inputs, context) =>
        service.failOrganizationWinnerPromotion(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }

  private registerPaidCreativeResearchExecutors(engine: WorkflowEngine): void {
    const service = this.paidCreativeResearchWorkflowService;
    if (!service) return;
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.PAID_CREATIVE_PREPARE,
      async (_node, _inputs, context) =>
        service.preparePaidCreativeResearch(context.organizationId),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.PAID_CREATIVE_DISCOVER,
      (node, inputs, context) =>
        service.discoverPaidCreativeAdvertisers(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.PAID_CREATIVE_INGEST,
      (node, inputs, context) =>
        service.ingestPaidCreativeAdvertiser(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
    engine.registerExecutor(
      AUTOMATION_ACTION_IDS.PAID_CREATIVE_FINALIZE,
      async (node, inputs, context) =>
        service.finalizePaidCreativeResearch(
          context.organizationId,
          actionInputs(node.config, inputs),
        ),
    );
  }
}

function workflowContext(
  context: ExecutionContext,
  node: { id: string; type: string },
) {
  return {
    workflowExecutionId: context.executionId,
    workflowId: context.workflowId,
    workflowNodeId: node.id,
    workflowNodeType: node.type,
    workflowRunId: context.runId,
  };
}

function actionInputs(
  config: Record<string, unknown>,
  inputs: Map<string, unknown> | Record<string, unknown>,
): Record<string, unknown> {
  return buildActionExecutionInput(config, inputs);
}
