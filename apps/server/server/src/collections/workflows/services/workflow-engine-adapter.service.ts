import type {
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionOptions,
  ExecutionRunResult,
  NodeExecutor,
} from '@genfeedai/workflows/engine';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { CaptionsService } from '@server/collections/captions/services/captions.service';
import { PerformanceSummaryService } from '@server/collections/content-performance/services/performance-summary.service';
import { WinnerPromotionWorkflowService } from '@server/collections/content-performance/services/winner-promotion-workflow.service';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { MusicsService } from '@server/collections/musics/services/musics.service';
import { NewslettersService } from '@server/collections/newsletters/services/newsletters.service';
import { PostAccountFanoutService } from '@server/collections/posts/services/post-account-fanout.service';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import { SourcePostsService } from '@server/collections/source-posts/services/source-posts.service';
import { TrendsService } from '@server/collections/trends/services/trends.service';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@server/collections/videos/services/video-music-orchestration.service';
import type {
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';
import { AdAutomationWorkflowService } from '@server/collections/workflows/services/ad-automation-workflow.service';
import { AdBulkUploadWorkflowService } from '@server/collections/workflows/services/ad-bulk-upload-workflow.service';
import { SocialAdapterFactory } from '@server/collections/workflows/services/adapters/social-adapter.factory';
import { YoutubeSocialAdapter } from '@server/collections/workflows/services/adapters/youtube-social.adapter';
import { AgentAutopilotWorkflowService } from '@server/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
import { ContentProductionWorkflowService } from '@server/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@server/collections/workflows/services/livestream-bot-workflow.service';
import { PaidCreativeResearchWorkflowService } from '@server/collections/workflows/services/paid-creative-research-workflow.service';
import { ReplyPollingWorkflowService } from '@server/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@server/collections/workflows/services/trend-notification-workflow.service';
import { VideoQaContinuityResolverService } from '@server/collections/workflows/services/video-qa-continuity-resolver.service';
import { WorkflowAutomationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-automation-executor-registrar.service';
import { WorkflowContentExecutorRegistrarService } from '@server/collections/workflows/services/workflow-content-executor-registrar.service';
import { WorkflowCoreExecutorRegistrarService } from '@server/collections/workflows/services/workflow-core-executor-registrar.service';
import {
  type WorkflowDocumentShape,
  WorkflowEngineConverterService,
} from '@server/collections/workflows/services/workflow-engine-converter.service';
import { WorkflowEngineExecutorHelperService } from '@server/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@server/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { WorkflowNodeContinuationService } from '@server/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowSocialExecutorRegistrarService } from '@server/collections/workflows/services/workflow-social-executor-registrar.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@server/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
import { CacheService } from '@server/services/cache/cache.service';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@server/services/files-microservice/queue/file-queue.service';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { HeyGenService } from '@server/services/integrations/heygen/services/heygen.service';
import { OpenRouterService } from '@server/services/integrations/openrouter/services/openrouter.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { NotificationsService } from '@server/services/notifications/notifications.service';
import { PromptBuilderService } from '@server/services/prompt-builder/prompt-builder.service';
import { SeoScorerService } from '@server/services/seo/seo-scorer.service';
import { WhisperService } from '@server/services/whisper/whisper.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { SharedService } from '@server/shared/services/shared/shared.service';

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
    @Inject(AdAutomationWorkflowService)
    private readonly adAutomationWorkflowService:
      | AdAutomationWorkflowService
      | undefined,
    @Optional()
    private readonly agentAutopilotWorkflowService?: AgentAutopilotWorkflowService,
    @Inject(AnalyticsSyncWorkflowService)
    private readonly analyticsSyncWorkflowService:
      | AnalyticsSyncWorkflowService
      | undefined,
    @Optional()
    private readonly contentProductionWorkflowService?: ContentProductionWorkflowService,
    @Optional()
    private readonly replyPollingWorkflowService?: ReplyPollingWorkflowService,
    @Optional()
    private readonly trendNotificationWorkflowService?: TrendNotificationWorkflowService,
    @Optional()
    private readonly livestreamBotWorkflowService?: LivestreamBotWorkflowService,
    @Optional() private readonly seoScorerService?: SeoScorerService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
    @Optional() private readonly youtubeSocialAdapter?: YoutubeSocialAdapter,
    @Optional() private readonly socialInboxService?: SocialInboxService,
    @Optional() private readonly sourcePostsService?: SourcePostsService,
    @Optional() private readonly twitterService?: TwitterService,
    // Appended at the end (not inline with its automation-service siblings)
    // so it never shifts the fixed positional indices the adapter spec file
    // relies on (e.g. AGENT_AUTOPILOT_SERVICE_INDEX, SOCIAL_INBOX_SERVICE_INDEX).
    @Optional()
    private readonly winnerPromotionWorkflowService?: WinnerPromotionWorkflowService,
    @Optional()
    private readonly paidCreativeResearchWorkflowService?: PaidCreativeResearchWorkflowService,
    @Optional()
    private readonly postAccountFanoutService?: PostAccountFanoutService,
    @Optional()
    private readonly videoQaContinuityResolver?: VideoQaContinuityResolverService,
    @Inject(AdBulkUploadWorkflowService)
    private readonly adBulkUploadWorkflowService:
      | AdBulkUploadWorkflowService
      | undefined,
    @Optional()
    private readonly workflowNodeContinuationService?: WorkflowNodeContinuationService,
  ) {
    this.engine = new WorkflowEngine({ maxConcurrency: 3 });
    this.converter = new WorkflowEngineConverterService();

    const helper = new WorkflowEngineExecutorHelperService(
      this.configService,
      this.sharedService,
      this.metadataService,
      this.ingredientsService,
      this.workflowNodeContinuationService,
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
      this.twitterService,
      this.credentialsService,
      this.notificationsService,
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
        this.videoQaContinuityResolver,
      );
    const mediaGenerationRegistrar =
      new WorkflowMediaGenerationExecutorRegistrarService(
        helper,
        this.loggerService,
        this.promptBuilderService,
        this.heyGenService,
        this.elevenLabsService,
        this.replicateService,
        this.filesClientService,
      );
    const contentRegistrar = new WorkflowContentExecutorRegistrarService(
      helper,
      this.postsService,
      this.credentialsService,
      this.newslettersService,
      this.openRouterService,
      this.sourcePostsService,
      this.postAccountFanoutService,
    );
    const automationRegistrar = new WorkflowAutomationExecutorRegistrarService(
      this.adAutomationWorkflowService,
      this.agentAutopilotWorkflowService,
      this.analyticsSyncWorkflowService,
      this.contentProductionWorkflowService,
      this.replyPollingWorkflowService,
      this.trendNotificationWorkflowService,
      this.livestreamBotWorkflowService,
      this.winnerPromotionWorkflowService,
      this.paidCreativeResearchWorkflowService,
      this.adBulkUploadWorkflowService,
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
        this.postAccountFanoutService,
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

  getRegisteredActionIds(): string[] {
    return this.engine.getRegisteredActionIds();
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
