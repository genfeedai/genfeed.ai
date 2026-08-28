import type {
  ExecutionContext,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { WinnerPromotionWorkflowService } from '@server/collections/content-performance/services/winner-promotion-workflow.service';
import { AdAutomationWorkflowService } from '@server/collections/workflows/services/ad-automation-workflow.service';
import {
  AD_BULK_UPLOAD_ACTION_IDS,
  AdBulkUploadWorkflowService,
} from '@server/collections/workflows/services/ad-bulk-upload-workflow.service';
import { AgentAutopilotWorkflowService } from '@server/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
import { ContentProductionWorkflowService } from '@server/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@server/collections/workflows/services/livestream-bot-workflow.service';
import { OutreachCampaignDispatchWorkflowService } from '@server/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { PaidCreativeResearchWorkflowService } from '@server/collections/workflows/services/paid-creative-research-workflow.service';
import { ReplyPollingWorkflowService } from '@server/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@server/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowEngineExecutorHelperService } from '@server/collections/workflows/services/workflow-engine-executor-helper.service';
import { AD_AUTOMATION_ACTION_IDS } from '@server/collections/workflows/templates/ad-automation-workflows.template';
import { ANALYTICS_SYNC_ACTION_IDS } from '@server/collections/workflows/templates/analytics-sync-workflows.template';
import type { TrendNotificationCadence } from '@server/collections/workflows/templates/trend-notification-workflows.template';

export class WorkflowAutomationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly adAutomationWorkflowService?: AdAutomationWorkflowService,
    private readonly agentAutopilotWorkflowService?: AgentAutopilotWorkflowService,
    private readonly analyticsSyncWorkflowService?: AnalyticsSyncWorkflowService,
    private readonly contentProductionWorkflowService?: ContentProductionWorkflowService,
    private readonly replyPollingWorkflowService?: ReplyPollingWorkflowService,
    private readonly trendNotificationWorkflowService?: TrendNotificationWorkflowService,
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
    private readonly winnerPromotionWorkflowService?: WinnerPromotionWorkflowService,
    private readonly paidCreativeResearchWorkflowService?: PaidCreativeResearchWorkflowService,
    private readonly outreachCampaignDispatchWorkflowService?: OutreachCampaignDispatchWorkflowService,
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
    this.registerOutreachCampaignDispatchExecutors(engine);
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
      (node, inputs) =>
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
      (node, inputs) =>
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
    engine.registerExecutor(
      'proactiveAgentStrategies',
      (_node, _inputs, context) =>
        this.agentAutopilotWorkflowService
          ? this.agentAutopilotWorkflowService.runProactiveStrategies(
              context.organizationId,
              workflowContext(context, _node),
            )
          : this.agentAutopilotUnavailable('proactiveAgentStrategies', context),
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
      (node, inputs) =>
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
    engine.registerExecutor('contentEngineProduction', (_node, _inputs, ctx) =>
      this.contentProductionWorkflowService
        ? this.contentProductionWorkflowService.runContentEngineProduction(
            ctx.organizationId,
          )
        : this.contentProductionUnavailable('contentEngineProduction', ctx),
    );
    engine.registerExecutor(
      'contentPipelineAutopilot',
      (_node, _inputs, ctx) =>
        this.contentProductionWorkflowService
          ? this.contentProductionWorkflowService.runContentPipelineAutopilot(
              ctx.organizationId,
            )
          : this.contentProductionUnavailable('contentPipelineAutopilot', ctx),
    );
  }

  private registerReplyPollingExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor('replyBotPolling', (_node, _inputs, context) =>
      this.replyPollingWorkflowService
        ? this.replyPollingWorkflowService.runReplyBotPolling(
            context.organizationId,
          )
        : this.replyPollingUnavailable('replyBotPolling', context),
    );
    engine.registerExecutor(
      'socialTriggerPolling',
      (_node, _inputs, context) =>
        this.replyPollingWorkflowService
          ? this.replyPollingWorkflowService.runSocialTriggerPolling(
              context.organizationId,
            )
          : this.replyPollingUnavailable('socialTriggerPolling', context),
    );
  }

  private registerTrendNotificationExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'trendSummaryNotifications',
      (node, _inputs, context) => {
        if (!this.trendNotificationWorkflowService) {
          return this.trendNotificationUnavailable(
            'trendSummaryNotifications',
            context,
          );
        }

        const cadence = this.helper.readConfigString(node.config, 'cadence');
        if (!this.isTrendNotificationCadence(cadence)) {
          throw new Error(
            'trendSummaryNotifications requires cadence hourly, daily, or weekly',
          );
        }

        return this.trendNotificationWorkflowService.runTrendSummaryNotifications(
          context.organizationId,
          cadence,
        );
      },
    );
  }

  private registerLivestreamBotExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'livestreamBotSessionProcessing',
      (_node, _inputs, context) =>
        this.livestreamBotWorkflowService
          ? this.livestreamBotWorkflowService.runActiveSessionProcessing(
              context.organizationId,
            )
          : this.livestreamBotUnavailable(
              'livestreamBotSessionProcessing',
              context,
            ),
    );

    engine.registerExecutor('restreamChatIngest', (node, inputs, context) => {
      if (!this.livestreamBotWorkflowService) {
        return this.livestreamBotUnavailable('restreamChatIngest', context);
      }

      const inputRecord =
        inputs instanceof Map
          ? Object.fromEntries(inputs.entries())
          : inputs && typeof inputs === 'object' && !Array.isArray(inputs)
            ? (inputs as unknown as Record<string, unknown>)
            : {};
      const contextRecord = context as unknown as Record<string, unknown>;
      const triggerData =
        contextRecord.inputValues &&
        typeof contextRecord.inputValues === 'object' &&
        !Array.isArray(contextRecord.inputValues)
          ? (contextRecord.inputValues as Record<string, unknown>)
          : contextRecord.triggerData &&
              typeof contextRecord.triggerData === 'object' &&
              !Array.isArray(contextRecord.triggerData)
            ? (contextRecord.triggerData as Record<string, unknown>)
            : {};

      const botId =
        this.helper.readConfigString(node.config, 'botId') ||
        (typeof inputRecord.botId === 'string' ? inputRecord.botId : '') ||
        (typeof triggerData.botId === 'string' ? triggerData.botId : '');

      if (!botId) {
        throw new Error('restreamChatIngest requires botId');
      }

      return this.livestreamBotWorkflowService.runRestreamChatIngest(
        context.organizationId,
        botId,
      );
    });
  }

  private registerWinnerPromotionExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'harnessWinnerPromotionSweep',
      (_node, _inputs, context) =>
        this.winnerPromotionWorkflowService
          ? this.winnerPromotionWorkflowService.runOrganizationWinnerPromotion(
              context.organizationId,
            )
          : this.winnerPromotionUnavailable(
              'harnessWinnerPromotionSweep',
              context,
            ),
    );
  }

  private registerPaidCreativeResearchExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'paidCreativeResearchIngestion',
      (_node, _inputs, context) =>
        this.paidCreativeResearchWorkflowService
          ? this.paidCreativeResearchWorkflowService.runPaidCreativeResearchIngestion(
              context.organizationId,
            )
          : this.paidCreativeResearchUnavailable(
              'paidCreativeResearchIngestion',
              context,
            ),
    );
  }

  private registerOutreachCampaignDispatchExecutors(
    engine: WorkflowEngine,
  ): void {
    engine.registerExecutor(
      'outreachCampaignDispatch',
      (_node, _inputs, context) =>
        this.outreachCampaignDispatchWorkflowService
          ? this.outreachCampaignDispatchWorkflowService.runActiveCampaignDispatch(
              context.organizationId,
            )
          : this.outreachCampaignDispatchUnavailable(
              'outreachCampaignDispatch',
              context,
            ),
    );
  }

  private async winnerPromotionUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'WinnerPromotionWorkflowService',
      context,
    );
  }

  private async paidCreativeResearchUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'PaidCreativeResearchWorkflowService',
      context,
    );
  }

  private async outreachCampaignDispatchUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'OutreachCampaignDispatchWorkflowService',
      context,
    );
  }

  private async agentAutopilotUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'AgentAutopilotWorkflowService',
      context,
    );
  }

  private async contentProductionUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'ContentProductionWorkflowService',
      context,
    );
  }

  private async replyPollingUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'ReplyPollingWorkflowService',
      context,
    );
  }

  private async trendNotificationUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'TrendNotificationWorkflowService',
      context,
    );
  }

  private async livestreamBotUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    throw this.unavailableServiceError(
      action,
      'LivestreamBotWorkflowService',
      context,
    );
  }

  private unavailableServiceError(
    action: string,
    service: string,
    context: ExecutionContext,
  ): Error {
    return new Error(
      `${action} cannot execute for organization ${context.organizationId}: ${service} is unavailable`,
    );
  }

  private isTrendNotificationCadence(
    cadence: string | undefined,
  ): cadence is TrendNotificationCadence {
    return cadence === 'hourly' || cadence === 'daily' || cadence === 'weekly';
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
  const parameters =
    config.parameters !== null &&
    typeof config.parameters === 'object' &&
    !Array.isArray(config.parameters)
      ? (config.parameters as Record<string, unknown>)
      : {};
  return {
    ...parameters,
    ...(inputs instanceof Map ? Object.fromEntries(inputs) : inputs),
  };
}
