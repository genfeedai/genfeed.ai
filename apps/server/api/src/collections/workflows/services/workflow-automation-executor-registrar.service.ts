import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { OutreachCampaignDispatchWorkflowService } from '@api/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { XAdsInspirationWorkflowService } from '@api/collections/workflows/services/x-ads-inspiration-workflow.service';
import type { TrendNotificationCadence } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import type {
  ExecutionContext,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';

export class WorkflowAutomationExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly adAutomationWorkflowService?: AdAutomationWorkflowService,
    private readonly campaignOrchestrationWorkflowService?: CampaignOrchestrationWorkflowService,
    private readonly agentAutopilotWorkflowService?: AgentAutopilotWorkflowService,
    private readonly analyticsSyncWorkflowService?: AnalyticsSyncWorkflowService,
    private readonly contentProductionWorkflowService?: ContentProductionWorkflowService,
    private readonly replyPollingWorkflowService?: ReplyPollingWorkflowService,
    private readonly trendNotificationWorkflowService?: TrendNotificationWorkflowService,
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
    private readonly winnerPromotionWorkflowService?: WinnerPromotionWorkflowService,
    private readonly xAdsInspirationWorkflowService?: XAdsInspirationWorkflowService,
    private readonly outreachCampaignDispatchWorkflowService?: OutreachCampaignDispatchWorkflowService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerAdAutomationExecutors(engine);
    this.registerCampaignOrchestrationExecutors(engine);
    this.registerAgentAutopilotExecutors(engine);
    this.registerAnalyticsSyncExecutors(engine);
    this.registerContentProductionExecutors(engine);
    this.registerReplyPollingExecutors(engine);
    this.registerTrendNotificationExecutors(engine);
    this.registerLivestreamBotExecutors(engine);
    this.registerWinnerPromotionExecutors(engine);
    this.registerXAdsInspirationExecutors(engine);
    this.registerOutreachCampaignDispatchExecutors(engine);
  }

  private registerAdAutomationExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor('adOptimization', (_node, _inputs, context) =>
      this.adAutomationWorkflowService
        ? this.adAutomationWorkflowService.runAdOptimization(
            context.organizationId,
          )
        : this.adAutomationUnavailable('adOptimization', context),
    );
    engine.registerExecutor('adSyncGoogle', (_node, _inputs, context) =>
      this.adAutomationWorkflowService
        ? this.adAutomationWorkflowService.runGoogleAdSync(
            context.organizationId,
          )
        : this.adAutomationUnavailable('adSyncGoogle', context),
    );
    engine.registerExecutor('adSyncMeta', (_node, _inputs, context) =>
      this.adAutomationWorkflowService
        ? this.adAutomationWorkflowService.runMetaAdSync(context.organizationId)
        : this.adAutomationUnavailable('adSyncMeta', context),
    );
    engine.registerExecutor('adSyncTikTok', (_node, _inputs, context) =>
      this.adAutomationWorkflowService
        ? this.adAutomationWorkflowService.runTikTokAdSync(
            context.organizationId,
          )
        : this.adAutomationUnavailable('adSyncTikTok', context),
    );
  }

  private registerCampaignOrchestrationExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'agentCampaignOrchestration',
      (_node, _inputs, context) =>
        this.campaignOrchestrationWorkflowService
          ? this.campaignOrchestrationWorkflowService.runDueCampaignOrchestration(
              context.organizationId,
            )
          : this.campaignOrchestrationUnavailable(
              'agentCampaignOrchestration',
              context,
            ),
    );
    engine.registerExecutor(
      'agentCampaignTriggerEvaluation',
      (_node, _inputs, context) =>
        this.campaignOrchestrationWorkflowService
          ? this.campaignOrchestrationWorkflowService.runTriggerEvaluations(
              context.organizationId,
            )
          : this.campaignOrchestrationUnavailable(
              'agentCampaignTriggerEvaluation',
              context,
            ),
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
    engine.registerExecutor(
      'aiInfluencerDailyPosts',
      (_node, _inputs, context) =>
        this.agentAutopilotWorkflowService
          ? this.agentAutopilotWorkflowService.runAiInfluencerDailyPosts(
              context.organizationId,
              workflowContext(context, _node),
            )
          : this.agentAutopilotUnavailable('aiInfluencerDailyPosts', context),
    );
  }

  private registerAnalyticsSyncExecutors(engine: WorkflowEngine): void {
    const actions = [
      ['analyticsFacebookSync', 'runFacebookAnalytics'],
      ['analyticsSocialSync', 'runSocialAnalytics'],
      ['analyticsThreadsSync', 'runThreadsAnalytics'],
      ['analyticsTwitterSync', 'runTwitterAnalytics'],
      ['analyticsGenericSync', 'runGenericAnalyticsSync'],
      ['youtubeAnalyticsSync', 'runYouTubeAnalytics'],
    ] as const;

    for (const [nodeType, method] of actions) {
      engine.registerExecutor(nodeType, (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService[method](context.organizationId)
          : this.analyticsSyncUnavailable(nodeType, context),
      );
    }
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
          return this.trendNotificationUnavailable(
            'trendSummaryNotifications',
            context,
            'trend_notification_cadence_invalid',
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
        return Promise.resolve({
          action: 'restreamChatIngest',
          ingested: 0,
          organizationId: context.organizationId,
          reason: 'botId_required',
          status: 'failed',
        });
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

  private registerXAdsInspirationExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor(
      'xAdsInspirationIngestion',
      (_node, _inputs, context) =>
        this.xAdsInspirationWorkflowService
          ? this.xAdsInspirationWorkflowService.runXAdsInspirationIngestion(
              context.organizationId,
            )
          : this.xAdsInspirationUnavailable(
              'xAdsInspirationIngestion',
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
    return {
      action,
      brandsEligible: 0,
      brandsFailed: 0,
      brandsPromoted: 0,
      organizationId: context.organizationId,
      promoted: 0,
      reason: 'winner_promotion_service_unavailable',
      status: 'skipped',
    };
  }

  private async xAdsInspirationUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      advertisersChecked: 0,
      errors: 0,
      organizationId: context.organizationId,
      reason: 'x_ads_inspiration_service_unavailable',
      recordsIngested: 0,
      skipped: 1,
      status: 'skipped',
    };
  }

  private async outreachCampaignDispatchUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      alreadyQueued: 0,
      enqueued: 0,
      failed: 0,
      organizationId: context.organizationId,
      reason: 'outreach_campaign_dispatch_service_unavailable',
      skipped: 1,
      status: 'skipped',
    };
  }

  private async adAutomationUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      enqueued: 0,
      organizationId: context.organizationId,
      reason: 'ad_automation_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private async campaignOrchestrationUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      enqueued: 0,
      organizationId: context.organizationId,
      reason: 'campaign_orchestration_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private async agentAutopilotUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      enqueued: 0,
      generated: 0,
      organizationId: context.organizationId,
      reason: 'agent_autopilot_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private async analyticsSyncUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      enqueued: 0,
      organizationId: context.organizationId,
      posts: 0,
      queueName: '',
      reason: 'analytics_sync_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private async contentProductionUnavailable(
    action: string,
    context: ExecutionContext,
    reason = 'content_production_service_unavailable',
  ) {
    return {
      action,
      failed: 0,
      organizationId: context.organizationId,
      processed: 0,
      reason,
      skipped: 1,
      status: 'skipped',
    };
  }

  private async replyPollingUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      checked: 0,
      errors: 0,
      organizationId: context.organizationId,
      reason: 'reply_polling_service_unavailable',
      skipped: 1,
      status: 'skipped',
      triggered: 0,
    };
  }

  private async trendNotificationUnavailable(
    action: string,
    context: ExecutionContext,
    reason = 'trend_notification_service_unavailable',
  ) {
    return {
      action,
      errors: 0,
      organizationId: context.organizationId,
      reason,
      sent: 0,
      skipped: 1,
      status: 'skipped',
      trends: 0,
    };
  }

  private async livestreamBotUnavailable(
    action: string,
    context: ExecutionContext,
  ) {
    return {
      action,
      failed: 0,
      organizationId: context.organizationId,
      processed: 0,
      reason: 'livestream_bot_service_unavailable',
      sessions: 0,
      skipped: 1,
      status: 'skipped',
    };
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
