import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  LEGACY_CRON_JOB_EXECUTOR,
  type LegacyCronJobExecutor,
} from '@api/collections/cron-jobs/legacy-cron-job-executor.token';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import type {
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
import { WorkflowContentExecutorRegistrarService } from '@api/collections/workflows/services/workflow-content-executor-registrar.service';
import { WorkflowCoreExecutorRegistrarService } from '@api/collections/workflows/services/workflow-core-executor-registrar.service';
import {
  type WorkflowDocumentShape,
  WorkflowEngineConverterService,
} from '@api/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowSocialExecutorRegistrarService } from '@api/collections/workflows/services/workflow-social-executor-registrar.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type {
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionOptions,
  ExecutionRunResult,
  NodeExecutor,
} from '@genfeedai/workflow-engine';
import { WorkflowEngine } from '@genfeedai/workflow-engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { PerformanceSummaryService } from '@server-domain/collections/content-performance/services/performance-summary.service';

/**
 * Bridges NestJS services with the pure workflow-engine package.
 *
 * The adapter owns the engine instance and public execution/conversion API.
 * Executor registration is delegated to cohesive API-local registrar services.
 */
@Injectable()
export class WorkflowEngineAdapterService {
  private readonly logContext = 'WorkflowEngineAdapterService';
  private readonly engine: WorkflowEngine;
  private readonly converter: WorkflowEngineConverterService;
  private readonly trendPublishRegistrar: WorkflowTrendPublishExecutorRegistrarService;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly socialAdapterFactory?: SocialAdapterFactory,
    @Optional()
    private readonly avatarVideoGenerationService?: AvatarVideoGenerationService,
    @Optional() private readonly captionsService?: CaptionsService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly ingredientsService?: IngredientsService,
    @Optional() private readonly metadataService?: MetadataService,
    @Optional() private readonly musicsService?: MusicsService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly credentialsService?: CredentialsService,
    @Optional() private readonly newslettersService?: NewslettersService,
    @Optional() private readonly sharedService?: SharedService,
    @Optional()
    private readonly videoMusicOrchestrationService?: VideoMusicOrchestrationService,
    @Optional() private readonly whisperService?: WhisperService,
    @Optional() private readonly heyGenService?: HeyGenService,
    @Optional() private readonly elevenLabsService?: ElevenLabsService,
    @Optional() private readonly openRouterService?: OpenRouterService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly brandsService?: BrandsService,
    @Optional()
    private readonly performanceSummaryService?: PerformanceSummaryService,
    @Optional() private readonly trendsService?: TrendsService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly adAutomationWorkflowService?: AdAutomationWorkflowService,
    @Optional()
    private readonly campaignOrchestrationWorkflowService?: CampaignOrchestrationWorkflowService,
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
    @Inject(LEGACY_CRON_JOB_EXECUTOR)
    private readonly legacyCronJobExecutor?: LegacyCronJobExecutor,
    @Optional()
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
    @Optional() private readonly seoScorerService?: SeoScorerService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
    @Optional() private readonly youtubeSocialAdapter?: YoutubeSocialAdapter,
    @Optional() private readonly socialInboxService?: SocialInboxService,
  ) {
    this.engine = new WorkflowEngine({ maxConcurrency: 3 });
    this.converter = new WorkflowEngineConverterService();

    const helper = new WorkflowEngineExecutorHelperService(
      this.configService,
      this.sharedService,
      this.metadataService,
      this.ingredientsService,
    );

    const coreRegistrar = new WorkflowCoreExecutorRegistrarService(
      helper,
      this.loggerService,
      this.brandsService,
      this.performanceSummaryService,
      this.openRouterService,
      this.seoScorerService,
    );
    const socialRegistrar = new WorkflowSocialExecutorRegistrarService(
      helper,
      this.loggerService,
      this.socialAdapterFactory,
      this.youtubeSocialAdapter,
      this.socialInboxService,
    );
    const mediaProcessingRegistrar =
      new WorkflowMediaProcessingExecutorRegistrarService(
        helper,
        this.configService,
        this.avatarVideoGenerationService,
        this.captionsService,
        this.fileQueueService,
        this.filesClientService,
        this.ingredientsService,
        this.metadataService,
        this.musicsService,
        this.sharedService,
        this.videoMusicOrchestrationService,
        this.whisperService,
      );
    const mediaGenerationRegistrar =
      new WorkflowMediaGenerationExecutorRegistrarService(
        helper,
        this.loggerService,
        this.promptBuilderService,
        this.heyGenService,
        this.elevenLabsService,
        this.replicateService,
      );
    const contentRegistrar = new WorkflowContentExecutorRegistrarService(
      helper,
      this.postsService,
      this.credentialsService,
      this.newslettersService,
      this.openRouterService,
    );
    const automationRegistrar = new WorkflowAutomationExecutorRegistrarService(
      helper,
      this.adAutomationWorkflowService,
      this.campaignOrchestrationWorkflowService,
      this.agentAutopilotWorkflowService,
      this.analyticsSyncWorkflowService,
      this.contentProductionWorkflowService,
      this.replyPollingWorkflowService,
      this.trendNotificationWorkflowService,
      this.legacyCronJobExecutor,
      this.livestreamBotWorkflowService,
    );
    this.trendPublishRegistrar =
      new WorkflowTrendPublishExecutorRegistrarService(
        helper,
        this.configService,
        this.loggerService,
        this.socialAdapterFactory,
        this.trendsService,
        this.notificationsService,
        this.cacheService,
        this.prismaService,
        this.creditsUtilsService,
        this.postsService,
        this.credentialsService,
        this.workflowExecutionQueueService,
      );

    coreRegistrar.register(this.engine);
    socialRegistrar.register(this.engine);
    mediaProcessingRegistrar.register(this.engine);
    mediaGenerationRegistrar.register(this.engine);
    contentRegistrar.register(this.engine);
    automationRegistrar.register(this.engine);
    this.trendPublishRegistrar.register(this.engine);
  }

  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.engine.registerExecutor(nodeType, executor);
    this.loggerService.debug(
      `${this.logContext} registered executor for ${nodeType}`,
    );
  }

  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    return this.converter.convertToExecutableWorkflow(workflowDoc);
  }

  applyRuntimeInputValues(
    workflowDoc: {
      inputVariables?: WorkflowInputVariable[];
      nodes?: WorkflowVisualNode[];
    },
    executableWorkflow: ExecutableWorkflow,
    inputValues: Record<string, unknown> = {},
  ): ExecutableWorkflow {
    return this.converter.applyRuntimeInputValues(
      workflowDoc,
      executableWorkflow,
      inputValues,
    );
  }

  convertStepsToExecutableWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    userId: string,
    organizationId: string,
  ): ExecutableWorkflow {
    return this.converter.convertStepsToExecutableWorkflow(
      workflowId,
      steps,
      userId,
      organizationId,
    );
  }

  async executeWorkflow(
    workflow: ExecutableWorkflow,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} executing workflow`, {
      nodeIds: options.nodeIds,
      workflowId: workflow.id,
    });

    const result = await this.engine.execute(workflow, options);

    this.loggerService.log(`${this.logContext} workflow execution completed`, {
      completedAt: result.completedAt,
      status: result.status,
      totalCreditsUsed: result.totalCreditsUsed,
      workflowId: workflow.id,
    });

    return result;
  }

  resumeWorkflow(
    workflow: ExecutableWorkflow,
    previousRunResult: ExecutionRunResult,
    options: ExecutionOptions = {},
  ): Promise<ExecutionRunResult> {
    this.loggerService.log(`${this.logContext} resuming workflow`, {
      workflowId: workflow.id,
    });

    return this.engine.resume(workflow, previousRunResult, options);
  }

  estimateCredits(nodes: ExecutableNode[]): number {
    return this.engine.estimateCredits(nodes);
  }

  applyScheduledDigestCharge(
    workflowId: string,
    summaries: Array<{ nodeType: string; output?: Record<string, unknown> }>,
  ): Promise<void> {
    return this.trendPublishRegistrar.applyScheduledDigestCharge(
      workflowId,
      summaries,
    );
  }

  buildDigestTrends(
    trends: TrendsService,
    topN: number,
    minViralScore: number,
    platforms: string[],
  ) {
    return this.trendPublishRegistrar.buildDigestTrends(
      trends,
      topN,
      minViralScore,
      platforms,
    );
  }
}
