import type { LegacyCronJobExecutor } from '@api/collections/cron-jobs/legacy-cron-job-executor.token';
import type { CronJobType } from '@api/collections/cron-jobs/schemas/cron-job.schema';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
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
    private readonly legacyCronJobExecutor?: LegacyCronJobExecutor,
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
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
    this.registerLegacyCronJobExecutors(engine);
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
    engine.registerExecutor('contentScheduleRun', (node, _inputs, context) => {
      if (!this.contentProductionWorkflowService) {
        return this.contentProductionUnavailable('contentScheduleRun', context);
      }

      const contentScheduleId = this.helper.readConfigString(
        node.config,
        'contentScheduleId',
      );
      if (!contentScheduleId) {
        return this.contentProductionUnavailable(
          'contentScheduleRun',
          context,
          'content_schedule_id_missing',
        );
      }

      return this.contentProductionWorkflowService.runContentSchedule(
        context.organizationId,
        contentScheduleId,
        context.workflowId,
      );
    });
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
  }

  private registerLegacyCronJobExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor('legacyCronJob', (node, _inputs, context) => {
      if (!this.legacyCronJobExecutor) {
        return this.legacyCronJobUnavailable(context, 'cron_jobs_unavailable');
      }

      const legacyCronJobId = this.helper.readConfigString(
        node.config,
        'legacyCronJobId',
      );
      const jobType = this.helper.readConfigString(node.config, 'jobType');
      if (!legacyCronJobId || !this.isLegacyCronJobType(jobType)) {
        return this.legacyCronJobUnavailable(
          context,
          'legacy_cron_job_config_invalid',
        );
      }

      return this.legacyCronJobExecutor.executeMigratedLegacyCronJob({
        legacyCronJobId,
        organizationId: context.organizationId,
        userId: context.userId,
      });
    });
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

  private async legacyCronJobUnavailable(
    context: ExecutionContext,
    reason: string,
  ) {
    return {
      action: 'legacyCronJob',
      organizationId: context.organizationId,
      reason,
      skipped: 1,
      status: 'skipped',
    };
  }

  private isLegacyCronJobType(
    jobType: string | undefined,
  ): jobType is CronJobType {
    return (
      jobType === 'workflow_execution' ||
      jobType === 'agent_strategy_execution' ||
      jobType === 'newsletter_substack'
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
