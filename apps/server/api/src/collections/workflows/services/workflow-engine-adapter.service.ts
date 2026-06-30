import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  LEGACY_CRON_JOB_EXECUTOR,
  type LegacyCronJobExecutor,
} from '@api/collections/cron-jobs/legacy-cron-job-executor.token';
import type { CronJobType } from '@api/collections/cron-jobs/schemas/cron-job.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import {
  isWorkflowInputNodeType,
  normalizeWorkflowNodeTypeToCanonical,
} from '@api/collections/workflows/node-type-aliases';
import type {
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowStep,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { AdAutomationWorkflowService } from '@api/collections/workflows/services/ad-automation-workflow.service';
import { SocialAdapterFactory } from '@api/collections/workflows/services/adapters/social-adapter.factory';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { TrendNotificationWorkflowService } from '@api/collections/workflows/services/trend-notification-workflow.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { TriggerEvent } from '@api/collections/workflows/services/workflow-executor.service';
import type { TrendNotificationCadence } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { ConfigService } from '@api/config/config.service';
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
import { MODEL_KEYS, TREND_DIGEST_CREDIT_COST } from '@genfeedai/constants';
import {
  ActivitySource,
  CaptionFormat,
  CaptionLanguage,
  type CredentialPlatform,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  MusicSourceType,
  PostCategory,
  PostStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { buildTrendDigestHtml } from '@genfeedai/helpers';
import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
  ExecutionContext,
  ExecutionOptions,
  ExecutionRunResult,
} from '@genfeedai/workflow-engine';
import {
  type AnalyticsFeedbackOutput,
  createAnalyticsFeedbackExecutor,
  createBrandAssetExecutor,
  createBrandContextExecutor,
  createHookGeneratorExecutor,
  createImageGenExecutor,
  createIterativeSeoRefineExecutor,
  createLipSyncExecutor,
  createMentionTriggerExecutor,
  createNewFollowerTriggerExecutor,
  createNewLikeTriggerExecutor,
  createNewRepostTriggerExecutor,
  createPostPublishTriggerExecutor,
  createPostReplyExecutor,
  createPromptConstructorExecutor,
  createPublishExecutor,
  createReframeExecutor,
  createSendDmExecutor,
  createSendEmailExecutor,
  createSeoRewriteExecutor,
  createSeoScoreExecutor,
  createTextToSpeechExecutor,
  createTrendDigestExecutor,
  createTrendTriggerExecutor,
  createUpscaleExecutor,
  type KeywordTriggerPlatform,
  type NodeExecutor,
  type SeoRewriteResolver,
  type SeoScoreResolver,
  type SocialPlatform,
  type TrendDigestEntry,
  type TrendPlatform,
  type TrendTriggerOutput,
  WorkflowEngine,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Inject, Injectable, Optional } from '@nestjs/common';

/**
 * Shape of workflow document passed to convertToExecutableWorkflow.
 * Represents a minimal subset of WorkflowDocument needed for conversion.
 */
interface WorkflowDocumentShape {
  _id?: string | { toString(): string };
  brands?: Array<string | { toString(): string }>;
  id?: string;
  nodes?: WorkflowVisualNode[];
  edges?: WorkflowEdge[];
  lockedNodeIds?: string[];
  organization?: string | { toString(): string };
  user?: string | { toString(): string };
}

interface WrappedEngineExecutor {
  execute(input: {
    context: ExecutionContext;
    inputs: Map<string, unknown>;
    node: ExecutableNode;
  }): Promise<{ data: unknown }>;
}

/**
 * Maps visual-builder NODE_REGISTRY types (kebab-case) to
 * engine EXECUTOR_REGISTRY types (camelCase).
 *
 * Node types not in this map pass through unchanged — they either
 * already match an executor name or are handled by the noop executor.
 */
/**
 * Node types that are available in the UI but currently run with
 * guarded fallback behavior on the backend (safe pass-through / no-op).
 */
const FALLBACK_EXECUTOR_TYPES = [
  'ai-avatar-video',
  'ai-enhance',
  'ai-generate-video',
  'ai-transcribe',
  'control-loop',
  'effect-ken-burns',
  'effect-portrait-blur',
  'effect-split-screen',
  'effect-text-overlay',
  'effect-watermark',
  'input-prompt',
  'input-template',
  'workflowInput',
  'workflowOutput',
  'workflow-input',
  'workflow-output',
  'output-export',
  'output-notify',
  'output-save',
  'output-webhook',
  'process-compress',
  'process-extract-audio',
  'process-merge-videos',
  'process-mirror',
  'process-resize',
  'process-reverse',
  'process-transform',
  'process-trim',
] as const;

const NODE_TYPE_TO_EXECUTOR: Record<string, string> = {
  'ai-avatar-video': 'aiAvatarVideo',
  'ai-enhance': 'ai-enhance',
  'ai-generate-image': 'imageGen',
  'ai-generate-newsletter': 'newsletterGen',
  'ai-generate-post': 'postGen',
  'ai-generate-video': 'ai-generate-video',
  'ai-lip-sync': 'lipSync',
  'ai-llm': 'llm',
  'ai-prompt-constructor': 'promptConstructor',
  'ai-reframe': 'reframe',
  'ai-text-to-speech': 'textToSpeech',
  'ai-transcribe': 'ai-transcribe',
  'ai-upscale': 'upscale',
  'ai-voice-change': 'voiceChange',
  brandAsset: 'brandAsset',
  'control-branch': 'condition',
  'control-delay': 'delay',
  'control-loop': 'control-loop',
  'effect-captions': 'effect-captions',
  'effect-color-grade': 'colorGrade',
  'effect-ken-burns': 'effect-ken-burns',
  'effect-portrait-blur': 'effect-portrait-blur',
  'effect-split-screen': 'effect-split-screen',
  'effect-text-overlay': 'effect-text-overlay',
  'effect-watermark': 'effect-watermark',
  'input-image': 'input-image',
  'input-prompt': 'input-prompt',
  'input-template': 'input-template',
  'input-video': 'input-video',
  'output-export': 'output-export',
  'output-notify': 'output-notify',
  'output-publish': 'publish',
  'output-save': 'output-save',
  'output-webhook': 'output-webhook',
  'process-compress': 'process-compress',
  'process-extract-audio': 'process-extract-audio',
  'process-merge-videos': 'process-merge-videos',
  'process-mirror': 'process-mirror',
  'process-resize': 'process-resize',
  'process-reverse': 'process-reverse',
  'process-transform': 'process-transform',
  'process-trim': 'process-trim',
  // Social interaction nodes
  'social-post-reply': 'postReply',
  'social-send-dm': 'sendDm',
  'trigger-mention': 'mentionTrigger',
  'trigger-new-follower': 'newFollowerTrigger',
  'trigger-new-like': 'newLikeTrigger',
  'trigger-new-repost': 'newRepostTrigger',
  'analytics-feedback': 'analyticsFeedback',
};

/**
 * Bridges NestJS service layer with the pure workflow-engine package.
 * Converts workflow records to engine-compatible format and wires
 * NestJS services as node executors.
 */
@Injectable()
export class WorkflowEngineAdapterService {
  private readonly logContext = 'WorkflowEngineAdapterService';
  private engine: WorkflowEngine;

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
  ) {
    this.engine = new WorkflowEngine({
      maxConcurrency: 3,
    });

    this.registerFallbackExecutors();
    this.registerReviewGateExecutor();
    this.registerSocialExecutors();
    this.registerAvatarVideoExecutor();
    this.registerImageGenExecutor();
    this.registerPromptConstructorExecutor();
    this.registerHookGeneratorExecutor();
    this.registerPostExecutor();
    this.registerNewsletterExecutor();
    this.registerCaptionsExecutor();
    this.registerLipSyncExecutor();
    this.registerMusicSourceExecutor();
    this.registerSoundOverlayExecutor();
    this.registerTextToSpeechExecutor();
    this.registerLlmExecutor();
    this.registerReframeExecutor();
    this.registerUpscaleExecutor();
    this.registerDirectMediaInputExecutors();
    this.registerBrandAssetExecutor();
    this.registerBrandContextExecutor();
    this.registerAnalyticsFeedbackExecutor();
    this.registerSeoExecutors();
    this.registerAdAutomationExecutors();
    this.registerCampaignOrchestrationExecutors();
    this.registerAgentAutopilotExecutors();
    this.registerAnalyticsSyncExecutors();
    this.registerContentProductionExecutors();
    this.registerReplyPollingExecutors();
    this.registerTrendNotificationExecutors();
    this.registerLivestreamBotExecutors();
    this.registerLegacyCronJobExecutors();
    this.registerTrendTriggerExecutor();
    this.registerTrendDigestExecutor();
    this.registerSendEmailExecutor();
    this.registerPublishExecutor();
  }

  /**
   * Registers guarded fallback executors for UI-available node types that
   * do not yet have a dedicated backend implementation.
   *
   * Behavior:
   * - If upstream input exists, pass through the most recent input value.
   * - If no upstream input exists, emit a structured skipped payload.
   */
  private registerFallbackExecutors(): void {
    for (const nodeType of FALLBACK_EXECUTOR_TYPES) {
      this.engine.registerExecutor(nodeType, async (node, inputs, context) => {
        this.loggerService.warn(
          `${this.logContext} fallback executor invoked`,
          {
            nodeId: node.id,
            nodeType,
            workflowId:
              typeof context.workflowId === 'string' ? context.workflowId : '',
          },
        );

        const inputValues = Array.from(inputs.values());
        if (inputValues.length > 0) {
          return inputValues[inputValues.length - 1];
        }

        return {
          nodeId: node.id,
          nodeType,
          reason: 'fallback_executor_no_upstream_input',
          status: 'skipped',
        };
      });
    }
  }

  private wrapEngineExecutor(executor: unknown): NodeExecutor {
    const wrappedExecutor = executor as WrappedEngineExecutor;

    return async (node, inputs, context) => {
      const result = await wrappedExecutor.execute({ context, inputs, node });

      return result.data;
    };
  }

  private registerReviewGateExecutor(): void {
    this.engine.registerExecutor('reviewGate', async (_node, inputs) => {
      const mediaInput = this.extractReviewGateInput(inputs, 'media');
      const captionInput = this.extractReviewGateInput(inputs, 'caption');

      return {
        approvalId: null,
        approvalStatus: 'pending',
        approvedAt: null,
        approvedBy: null,
        inputCaption: typeof captionInput === 'string' ? captionInput : null,
        inputMedia: this.extractMediaPreview(inputs.get('media')),
        outputCaption: null,
        outputMedia: null,
        rejectionReason: null,
        reviewGatePayload: {
          caption: captionInput,
          media: mediaInput,
        },
      };
    });
  }

  private registerImageGenExecutor(): void {
    if (
      !this.promptBuilderService ||
      !this.replicateService ||
      !this.sharedService ||
      !this.metadataService
    ) {
      return;
    }

    const imageGenExecutor = createImageGenExecutor();
    const promptBuilderService = this.promptBuilderService;
    const replicateService = this.replicateService;

    imageGenExecutor.setResolver(async (model, params, context) => {
      const references = Array.isArray(params.references)
        ? params.references.filter(
            (reference): reference is string => typeof reference === 'string',
          )
        : undefined;

      const negativePrompt =
        typeof params.negativePrompt === 'string'
          ? params.negativePrompt
          : undefined;
      const strength =
        typeof params.strength === 'number' ? params.strength : undefined;
      const style = typeof params.style === 'string' ? params.style : undefined;
      const prompt = typeof params.prompt === 'string' ? params.prompt : '';
      const width = typeof params.width === 'number' ? params.width : undefined;
      const height =
        typeof params.height === 'number' ? params.height : undefined;
      const seed = typeof params.seed === 'number' ? params.seed : undefined;

      const { input } = await promptBuilderService.buildPrompt(
        model as string,
        {
          height,
          modelCategory: ModelCategory.IMAGE,
          negativePrompt,
          prompt,
          references,
          seed,
          strength,
          style,
          width,
        },
        undefined,
      );

      const brandId = this.requireBrandId(params.brandId, 'imageGen');
      const pendingOutput = await this.createWorkflowOutputIngredient({
        brandId,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        externalId: null,
        model: model as string,
        organizationId: context.organizationId,
        userId: context.userId,
      });
      const predictionId = await replicateService.runModel(model, input);

      await this.metadataService?.patch(
        pendingOutput.metadataId,
        new MetadataEntity({
          externalId: predictionId,
          result: this.buildImageIngredientUrl(pendingOutput.ingredientId),
        }),
      );

      return {
        id: pendingOutput.ingredientId,
        imageUrl: this.buildImageIngredientUrl(pendingOutput.ingredientId),
        model,
        provider: 'replicate',
        status: IngredientStatus.PROCESSING,
      };
    });

    this.engine.registerExecutor(
      'imageGen',
      this.wrapEngineExecutor(imageGenExecutor),
    );
  }

  private registerDirectMediaInputExecutors(): void {
    this.engine.registerExecutor('input-image', async (node) =>
      this.resolveConfiguredMediaInput(node, 'image'),
    );
    this.engine.registerExecutor('input-video', async (node) =>
      this.resolveConfiguredMediaInput(node, 'video'),
    );
  }

  private registerBrandAssetExecutor(): void {
    if (!this.brandsService) {
      return;
    }

    const executor = createBrandAssetExecutor(
      async ({ assetType, brandId, organizationId }) => {
        if (!brandId || !organizationId) {
          return null;
        }

        const brand = await this.brandsService?.findOne(
          {
            _id: brandId,
            isDeleted: false,
            organization: organizationId,
          },
          ['detail'],
        );

        if (!brand) {
          return null;
        }

        if (assetType === 'logo') {
          const logoId = this.getDocumentId(
            (brand as unknown as { logo?: unknown }).logo,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: logoId ? this.buildLogoAssetUrl(logoId) : null,
            urls: [],
          };
        }

        if (assetType === 'banner') {
          const bannerId = this.getDocumentId(
            (brand as unknown as { banner?: unknown }).banner,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: bannerId ? this.buildBannerAssetUrl(bannerId) : null,
            urls: [],
          };
        }

        const references = Array.isArray(
          (brand as unknown as { references?: unknown[] }).references,
        )
          ? (brand as unknown as { references: unknown[] }).references
          : [];
        const urls = references
          .map((reference) => this.getDocumentId(reference))
          .filter((id): id is string => typeof id === 'string')
          .map((id) => this.buildReferenceAssetUrl(id));

        return {
          dimensions: null,
          mimeType: null,
          url: urls[0] ?? null,
          urls,
        };
      },
    );

    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  private registerBrandContextExecutor(): void {
    if (!this.brandsService) return;
    const brandsService = this.brandsService;
    const executor = createBrandContextExecutor(
      async (brandId, organizationId) => {
        const brand = await brandsService.findOne(
          { _id: brandId, isDeleted: false, organization: organizationId },
          ['detail'],
        );
        if (!brand) return null;
        const brandDoc = brand as unknown as Record<string, unknown>;
        return {
          brandId: String(brandDoc._id),
          colors:
            (brandDoc.colors as {
              primary: string;
              secondary: string;
              background: string;
            } | null) ?? null,
          fonts: (brandDoc.fonts as string | null) ?? null,
          label: String(brandDoc.name ?? brandDoc.label ?? ''),
          models: null,
          slug: String(brandDoc.slug ?? ''),
          voice: (brandDoc.voice as string | null) ?? null,
        };
      },
    );
    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  private registerAnalyticsFeedbackExecutor(): void {
    const summaryService = this.performanceSummaryService;
    const executor = createAnalyticsFeedbackExecutor(
      async ({ organizationId, brandId, topN, worstN }) => {
        if (!summaryService) {
          return this.createEmptyAnalyticsFeedback();
        }

        const summary = await summaryService.getWeeklySummary(
          organizationId,
          brandId,
          { topN, worstN },
        );
        const bestPlatform =
          summary.avgEngagementByPlatform.length > 0
            ? summary.avgEngagementByPlatform.reduce((best, current) =>
                current.avgEngagementRate > best.avgEngagementRate
                  ? current
                  : best,
              ).platform
            : null;
        return {
          avgEngagementRate:
            summary.avgEngagementByPlatform.length > 0
              ? summary.avgEngagementByPlatform.reduce(
                  (sum, p) => sum + p.avgEngagementRate,
                  0,
                ) / summary.avgEngagementByPlatform.length
              : 0,
          bestPlatform,
          bestPostingTimes: summary.bestPostingTimes.map((t) => ({
            avgEngagement: t.avgEngagementRate,
            dayOfWeek: 0,
            hour: t.hour,
          })),
          topHooks: summary.topHooks,
          topTopics: summary.topPerformers.map((p) => p.title).filter(Boolean),
          weekOverWeekChange: summary.weekOverWeekTrend.percentageChange,
          weekOverWeekDirection: summary.weekOverWeekTrend.direction,
          worstTopics: summary.worstPerformers
            .map((p) => p.title)
            .filter(Boolean),
        };
      },
    );
    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  /**
   * Registers the SEO workflow nodes (#761):
   * - `seoScore`: scores content via SeoScorerService, emitting score + suggestions.
   * - `seoRewrite`: rewrites content to address suggestions via the LLM client.
   * - `iterativeSeoRefine`: runs an internal score -> rewrite -> re-score loop
   *   (no graph cycle) until the target score is reached.
   * - `postPublishTrigger`: root trigger node; output is injected from the
   *   `post-published` event when a workflow is started by a publish.
   *
   * The score + rewrite resolvers are shared between the standalone nodes and
   * the iterative node so behavior stays identical across both composition styles.
   */
  private registerSeoExecutors(): void {
    const seoScorerService = this.seoScorerService;
    const openRouterService = this.openRouterService;

    const scoreResolver: SeoScoreResolver = async ({ content, useLlm }) => {
      if (!seoScorerService) {
        return {
          breakdown: {},
          rating: 'critical',
          score: 0,
          suggestions: ['SEO scorer service unavailable'],
        };
      }
      const scorecard = await seoScorerService.scoreContent(content, {
        useLlm,
      });
      return {
        breakdown: scorecard.breakdown,
        rating: scorecard.rating,
        score: scorecard.score,
        suggestions: scorecard.suggestions,
      };
    };

    const rewriteResolver: SeoRewriteResolver = async ({
      content,
      suggestions,
      targetKeyword,
      title,
      model,
    }) => {
      if (!openRouterService) {
        // Graceful degradation: return content unchanged so the loop terminates
        // rather than throwing in environments without an LLM client.
        return { model: null, text: content };
      }

      const systemPrompt =
        'You are an expert SEO editor. Rewrite the provided content to address ' +
        'the listed SEO suggestions while preserving the original meaning, tone, ' +
        'and factual accuracy. Return ONLY the rewritten content body (plain text ' +
        'or HTML matching the input) with no preamble or commentary.';

      const userPrompt = [
        title ? `Title: ${title}` : null,
        targetKeyword ? `Target keyword: ${targetKeyword}` : null,
        suggestions.length > 0
          ? `SEO suggestions to address:\n${suggestions
              .map((suggestion, index) => `${index + 1}. ${suggestion}`)
              .join('\n')}`
          : null,
        `Content:\n${content}`,
      ]
        .filter((section): section is string => section !== null)
        .join('\n\n');

      const response = await openRouterService.chatCompletion({
        max_tokens: 2000,
        messages: [
          { content: systemPrompt, role: 'system' },
          { content: userPrompt, role: 'user' },
        ],
        model: model ?? 'openai/gpt-4o-mini',
        temperature: 0.4,
      });

      const rewritten = response.choices[0]?.message?.content?.trim() ?? '';
      return {
        model: response.model,
        text: rewritten.length > 0 ? rewritten : content,
      };
    };

    const seoScoreExecutor = createSeoScoreExecutor(scoreResolver);
    this.engine.registerExecutor(
      seoScoreExecutor.nodeType,
      this.wrapEngineExecutor(seoScoreExecutor),
    );

    const seoRewriteExecutor = createSeoRewriteExecutor(rewriteResolver);
    this.engine.registerExecutor(
      seoRewriteExecutor.nodeType,
      this.wrapEngineExecutor(seoRewriteExecutor),
    );

    const iterativeSeoRefineExecutor = createIterativeSeoRefineExecutor(
      scoreResolver,
      rewriteResolver,
    );
    this.engine.registerExecutor(
      iterativeSeoRefineExecutor.nodeType,
      this.wrapEngineExecutor(iterativeSeoRefineExecutor),
    );

    const postPublishTriggerExecutor = createPostPublishTriggerExecutor();
    this.engine.registerExecutor(
      postPublishTriggerExecutor.nodeType,
      this.wrapEngineExecutor(postPublishTriggerExecutor),
    );
  }

  /**
   * Emits a `post-published` trigger event so any workflow rooted at a
   * `postPublishTrigger` node runs an SEO-optimization pass on the published
   * content. Best-effort: failures are logged and never block publishing.
   */
  private async emitPostPublishedEvent(params: {
    organizationId: string;
    userId: string;
    brandId: string;
    postIds: string[];
    platforms: SocialPlatform[];
    caption: string;
    targetKeyword: string | null;
    /** Publish status forwarded to PostPublishTriggerExecutor's `status` output field. */
    status?: string;
  }): Promise<void> {
    if (!this.workflowExecutionQueueService) {
      return;
    }

    const event: TriggerEvent = {
      data: {
        brandId: params.brandId,
        caption: params.caption,
        content: params.caption,
        platforms: params.platforms,
        postIds: params.postIds,
        status: params.status ?? 'queued',
        targetKeyword: params.targetKeyword,
        title: null,
      },
      organizationId: params.organizationId,
      platform: params.platforms[0] ?? 'multi',
      type: 'post-published',
      userId: params.userId,
    };

    try {
      await this.workflowExecutionQueueService.queueTriggerEvent(event);
    } catch (error) {
      this.loggerService.error(
        `${this.logContext} failed to emit post-published event`,
        {
          error: error instanceof Error ? error.message : String(error),
          organizationId: params.organizationId,
        },
      );
    }
  }

  private registerAdAutomationExecutors(): void {
    this.engine.registerExecutor(
      'adOptimization',
      async (_node, _inputs, context) =>
        this.adAutomationWorkflowService
          ? this.adAutomationWorkflowService.runAdOptimization(
              context.organizationId,
            )
          : this.adAutomationUnavailable('adOptimization', context),
    );

    this.engine.registerExecutor(
      'adSyncGoogle',
      async (_node, _inputs, context) =>
        this.adAutomationWorkflowService
          ? this.adAutomationWorkflowService.runGoogleAdSync(
              context.organizationId,
            )
          : this.adAutomationUnavailable('adSyncGoogle', context),
    );

    this.engine.registerExecutor(
      'adSyncMeta',
      async (_node, _inputs, context) =>
        this.adAutomationWorkflowService
          ? this.adAutomationWorkflowService.runMetaAdSync(
              context.organizationId,
            )
          : this.adAutomationUnavailable('adSyncMeta', context),
    );

    this.engine.registerExecutor(
      'adSyncTikTok',
      async (_node, _inputs, context) =>
        this.adAutomationWorkflowService
          ? this.adAutomationWorkflowService.runTikTokAdSync(
              context.organizationId,
            )
          : this.adAutomationUnavailable('adSyncTikTok', context),
    );
  }

  private adAutomationUnavailable(
    action: string,
    context: ExecutionContext,
  ): Record<string, unknown> {
    return {
      action,
      enqueued: 0,
      organizationId: context.organizationId,
      reason: 'ad_automation_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private registerCampaignOrchestrationExecutors(): void {
    this.engine.registerExecutor(
      'agentCampaignOrchestration',
      async (_node, _inputs, context) =>
        this.campaignOrchestrationWorkflowService
          ? this.campaignOrchestrationWorkflowService.runDueCampaignOrchestration(
              context.organizationId,
            )
          : this.campaignOrchestrationUnavailable(
              'agentCampaignOrchestration',
              context,
            ),
    );

    this.engine.registerExecutor(
      'agentCampaignTriggerEvaluation',
      async (_node, _inputs, context) =>
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

  private campaignOrchestrationUnavailable(
    action: string,
    context: ExecutionContext,
  ): Record<string, unknown> {
    return {
      action,
      enqueued: 0,
      organizationId: context.organizationId,
      reason: 'campaign_orchestration_service_unavailable',
      skipped: 0,
      status: 'skipped',
    };
  }

  private registerAgentAutopilotExecutors(): void {
    this.engine.registerExecutor(
      'proactiveAgentStrategies',
      async (_node, _inputs, context) =>
        this.agentAutopilotWorkflowService
          ? this.agentAutopilotWorkflowService.runProactiveStrategies(
              context.organizationId,
            )
          : this.agentAutopilotUnavailable('proactiveAgentStrategies', context),
    );

    this.engine.registerExecutor(
      'aiInfluencerDailyPosts',
      async (_node, _inputs, context) =>
        this.agentAutopilotWorkflowService
          ? this.agentAutopilotWorkflowService.runAiInfluencerDailyPosts(
              context.organizationId,
            )
          : this.agentAutopilotUnavailable('aiInfluencerDailyPosts', context),
    );
  }

  private agentAutopilotUnavailable(
    action: string,
    context: ExecutionContext,
  ): Record<string, unknown> {
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

  private registerAnalyticsSyncExecutors(): void {
    this.engine.registerExecutor(
      'analyticsFacebookSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runFacebookAnalytics(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('analyticsFacebookSync', context),
    );

    this.engine.registerExecutor(
      'analyticsSocialSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runSocialAnalytics(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('analyticsSocialSync', context),
    );

    this.engine.registerExecutor(
      'analyticsThreadsSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runThreadsAnalytics(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('analyticsThreadsSync', context),
    );

    this.engine.registerExecutor(
      'analyticsTwitterSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runTwitterAnalytics(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('analyticsTwitterSync', context),
    );

    this.engine.registerExecutor(
      'analyticsGenericSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runGenericAnalyticsSync(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('analyticsGenericSync', context),
    );

    this.engine.registerExecutor(
      'youtubeAnalyticsSync',
      (_node, _inputs, context) =>
        this.analyticsSyncWorkflowService
          ? this.analyticsSyncWorkflowService.runYouTubeAnalytics(
              context.organizationId,
            )
          : this.analyticsSyncUnavailable('youtubeAnalyticsSync', context),
    );
  }

  private async analyticsSyncUnavailable(
    action: string,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
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

  private registerContentProductionExecutors(): void {
    this.engine.registerExecutor(
      'contentEngineProduction',
      (_node, _inputs, context) =>
        this.contentProductionWorkflowService
          ? this.contentProductionWorkflowService.runContentEngineProduction(
              context.organizationId,
            )
          : this.contentProductionUnavailable(
              'contentEngineProduction',
              context,
            ),
    );

    this.engine.registerExecutor(
      'contentPipelineAutopilot',
      (_node, _inputs, context) =>
        this.contentProductionWorkflowService
          ? this.contentProductionWorkflowService.runContentPipelineAutopilot(
              context.organizationId,
            )
          : this.contentProductionUnavailable(
              'contentPipelineAutopilot',
              context,
            ),
    );

    this.engine.registerExecutor(
      'contentScheduleRun',
      (node, _inputs, context) => {
        if (!this.contentProductionWorkflowService) {
          return this.contentProductionUnavailable(
            'contentScheduleRun',
            context,
          );
        }

        const contentScheduleId = this.readConfigString(
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
      },
    );
  }

  private async contentProductionUnavailable(
    action: string,
    context: ExecutionContext,
    reason = 'content_production_service_unavailable',
  ): Promise<Record<string, unknown>> {
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

  private registerReplyPollingExecutors(): void {
    this.engine.registerExecutor(
      'replyBotPolling',
      (_node, _inputs, context) =>
        this.replyPollingWorkflowService
          ? this.replyPollingWorkflowService.runReplyBotPolling(
              context.organizationId,
            )
          : this.replyPollingUnavailable('replyBotPolling', context),
    );

    this.engine.registerExecutor(
      'socialTriggerPolling',
      (_node, _inputs, context) =>
        this.replyPollingWorkflowService
          ? this.replyPollingWorkflowService.runSocialTriggerPolling(
              context.organizationId,
            )
          : this.replyPollingUnavailable('socialTriggerPolling', context),
    );
  }

  private async replyPollingUnavailable(
    action: string,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
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

  private registerTrendNotificationExecutors(): void {
    this.engine.registerExecutor(
      'trendSummaryNotifications',
      (node, _inputs, context) => {
        if (!this.trendNotificationWorkflowService) {
          return this.trendNotificationUnavailable(
            'trendSummaryNotifications',
            context,
          );
        }

        const cadence = this.readConfigString(node.config, 'cadence');
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

  private async trendNotificationUnavailable(
    action: string,
    context: ExecutionContext,
    reason = 'trend_notification_service_unavailable',
  ): Promise<Record<string, unknown>> {
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

  private registerLivestreamBotExecutors(): void {
    this.engine.registerExecutor(
      'livestreamBotSessionProcessing',
      async (_node, _inputs, context) =>
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

  private async livestreamBotUnavailable(
    action: string,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
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

  private registerLegacyCronJobExecutors(): void {
    this.engine.registerExecutor('legacyCronJob', (node, _inputs, context) => {
      if (!this.legacyCronJobExecutor) {
        return this.legacyCronJobUnavailable(context, 'cron_jobs_unavailable');
      }

      const legacyCronJobId = this.readConfigString(
        node.config,
        'legacyCronJobId',
      );
      const jobType = this.readConfigString(node.config, 'jobType');
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

  private async legacyCronJobUnavailable(
    context: ExecutionContext,
    reason: string,
  ): Promise<Record<string, unknown>> {
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

  private registerTrendTriggerExecutor(): void {
    const executor = createTrendTriggerExecutor(async (params) => {
      const keywordMatch = await this.findTrendFromSocialKeywordMatch(params);
      if (keywordMatch) {
        return keywordMatch;
      }

      const topic = params.keywords.find(
        (keyword) => keyword.trim().length > 0,
      );
      if (!topic) {
        return null;
      }

      return {
        hashtags: [this.buildHashtag(topic)],
        platform: params.platform,
        soundId: null,
        topic,
        trendId: `analytics-${params.platform}-${topic
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`,
        videoUrl: null,
        viralScore: params.minViralScore,
      };
    });
    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  /**
   * Registers the generic sendEmail action node, wiring it to the
   * NotificationsService email transport. No-op registration if the transport
   * is unavailable (e.g. lightweight unit context) — the node then throws a
   * clear "sender not configured" error if it is ever invoked.
   */
  private registerSendEmailExecutor(): void {
    if (!this.notificationsService) {
      this.loggerService.warn(
        `${this.logContext} NotificationsService unavailable — sendEmail node disabled`,
      );
      return;
    }

    const notifications = this.notificationsService;
    const executor = createSendEmailExecutor(async ({ to, subject, html }) => {
      await notifications.sendEmail(to, subject, html);
    });

    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  /**
   * Registers the trendDigest action node. It assembles a curated daily digest
   * from the existing global trend corpus (deterministic — no scrape, no LLM),
   * resolving the org owner recipient, enforcing a durable per-day idempotency
   * marker (multi-replica safe via Redis SET NX), pre-checking credits, and
   * rendering the branded email. The actual charge happens post-send in
   * {@link applyScheduledDigestCharge}.
   */
  private registerTrendDigestExecutor(): void {
    if (
      !this.trendsService ||
      !this.prismaService ||
      !this.cacheService ||
      !this.creditsUtilsService
    ) {
      this.loggerService.warn(
        `${this.logContext} dependencies unavailable — trendDigest node disabled`,
      );
      return;
    }

    const trends = this.trendsService;
    const prisma = this.prismaService;
    const cache = this.cacheService;
    const credits = this.creditsUtilsService;
    const appUrl = String(this.configService.get('GENFEEDAI_APP_URL') ?? '');

    const executor = createTrendDigestExecutor();

    executor.setOwnerResolver(async (organizationId) => {
      const organization = await prisma.organization.findFirst({
        select: { user: { select: { email: true } }, userId: true },
        where: { id: organizationId, isDeleted: false },
      });
      if (!organization) {
        return null;
      }
      return {
        email: organization.user?.email ?? null,
        userId: organization.userId ?? null,
      };
    });

    executor.setTrendsProvider(({ topN, minViralScore, platforms }) =>
      this.buildDigestTrends(trends, topN, minViralScore, platforms),
    );

    executor.setIdempotencyGuard((key, ttlSeconds) =>
      cache.acquireLock(key, ttlSeconds),
    );

    executor.setCreditsChecker((organizationId, cost) =>
      credits.checkOrganizationCreditsAvailable(organizationId, cost),
    );

    executor.setRenderer((items, options) => ({
      html: buildTrendDigestHtml(items, {
        appUrl,
        headerTitle: options.headerTitle,
        minViralScore: options.minViralScore,
      }),
      subject: `Your daily trends — ${items.length} trending ${
        items.length === 1 ? 'topic' : 'topics'
      }`,
    }));

    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  /**
   * Fetches the curated top-N trends from the existing corpus and maps them to
   * the engine's structural trend shape. Mirrors the per-user digest fetch
   * (viral videos + trending hashtags + trending sounds), ranked by score.
   */
  private async buildDigestTrends(
    trends: TrendsService,
    topN: number,
    minViralScore: number,
    platforms: string[],
  ): Promise<TrendDigestEntry[]> {
    type RawTrend = {
      platform?: string;
      title?: string;
      description?: string;
      hashtag?: string;
      soundName?: string;
      url?: string;
      playUrl?: string;
      views?: number;
      playCount?: number;
      postCount?: number;
      viewCount?: number;
      usageCount?: number;
      viralScore?: number;
      viralityScore?: number;
    };

    const safeFetch = async (
      fetcher: () => Promise<unknown>,
    ): Promise<RawTrend[]> => {
      try {
        return ((await fetcher()) as RawTrend[]) ?? [];
      } catch (error) {
        this.loggerService.error(
          `${this.logContext} trend digest fetch failed`,
          { error },
        );
        return [];
      }
    };

    const [videos, hashtags, sounds] = await Promise.all([
      safeFetch(() => trends.getViralVideos({ limit: 10, minViralScore })),
      safeFetch(() => trends.getTrendingHashtags({ limit: 10 })),
      safeFetch(() => trends.getTrendingSounds({ limit: 10 })),
    ]);

    const mapped: TrendDigestEntry[] = [
      ...videos.map((video) => ({
        platform: video.platform || 'tiktok',
        topic: video.title || video.description || 'Trending Video',
        type: 'video' as const,
        url: video.url,
        usageCount: video.views || video.playCount,
        viralScore: video.viralScore || 0,
      })),
      ...hashtags
        .filter((hashtag) => (hashtag.viralityScore || 0) >= minViralScore)
        .map((hashtag) => ({
          platform: hashtag.platform || 'tiktok',
          topic: `#${hashtag.hashtag}`,
          type: 'hashtag' as const,
          usageCount: hashtag.postCount || hashtag.viewCount,
          viralScore: hashtag.viralityScore || 0,
        })),
      ...sounds
        .filter((sound) => (sound.usageCount || 0) >= 10000)
        .map((sound) => ({
          platform: 'tiktok',
          topic: sound.soundName || 'Trending Sound',
          type: 'sound' as const,
          url: sound.playUrl,
          usageCount: sound.usageCount,
          viralScore: sound.viralityScore || 80,
        })),
    ];

    // Honour the configured platform filter. The fetchers return a mixed-platform
    // corpus, so a workflow that narrows `platforms` (e.g. just ['youtube']) must
    // actually constrain the digest. An empty list is treated as "no constraint".
    const allowed = new Set(
      platforms.map((platform) => platform.toLowerCase()),
    );
    const filtered =
      allowed.size > 0
        ? mapped.filter((entry) => allowed.has(entry.platform.toLowerCase()))
        : mapped;

    return filtered.sort((a, b) => b.viralScore - a.viralScore).slice(0, topN);
  }

  /**
   * Deducts credits for a completed scheduled digest exactly once. Reads the
   * serializable node outputs (trendDigest payload + sendEmail result) and
   * charges only when the digest was rendered (skipped === false) AND the email
   * was sent. Guarded by a durable, non-released per-day Redis marker so a retry
   * or multi-replica run can never double-charge.
   */
  async applyScheduledDigestCharge(
    workflowId: string,
    summaries: Array<{ nodeType: string; output?: Record<string, unknown> }>,
  ): Promise<void> {
    if (!this.creditsUtilsService || !this.cacheService) {
      return;
    }

    const digest = summaries.find(
      (summary) => summary.nodeType === 'trendDigest',
    )?.output;
    const email = summaries.find(
      (summary) => summary.nodeType === 'sendEmail',
    )?.output;

    if (!digest || digest.skipped !== false) {
      return;
    }
    if (!email || email.sent !== true) {
      return;
    }

    const orgId = typeof digest.orgId === 'string' ? digest.orgId : null;
    const ownerUserId =
      typeof digest.ownerUserId === 'string' ? digest.ownerUserId : null;
    const creditCost =
      typeof digest.creditCost === 'number'
        ? digest.creditCost
        : TREND_DIGEST_CREDIT_COST;

    if (!orgId || !ownerUserId) {
      // The digest was rendered and the email was sent, but we cannot resolve who
      // to bill (org has a null owner userId). Charging is skipped — log it so the
      // billing gap is observable instead of silently giving away the delivery.
      this.loggerService.warn(
        `${this.logContext} trend digest charge skipped — missing orgId or ownerUserId after delivery`,
        { orgId, ownerUserId, workflowId },
      );
      return;
    }

    // Acquire the durable daily marker FIRST (atomic SET NX). Only the winning
    // replica/retry proceeds to deduct — this is what prevents a double charge
    // across concurrent scheduler replicas. If the marker already exists, the
    // charge for today is already (being) handled, so skip.
    const chargeKey = `workflow-digest-charged:${workflowId}:${this.digestUtcDateKey()}`;
    const charged = await this.cacheService.acquireLock(chargeKey, 93_600);
    if (!charged) {
      return;
    }

    try {
      await this.creditsUtilsService.deductCreditsFromOrganization(
        orgId,
        ownerUserId,
        creditCost,
        'Daily trends digest',
        ActivitySource.TREND_SCAN,
      );
    } catch (error) {
      this.loggerService.error(
        `${this.logContext} trend digest charge failed`,
        { error, organizationId: orgId, workflowId },
      );
      // Release the marker so the next scheduled run can retry the charge —
      // a transient deduction failure must not permanently skip today's charge.
      await this.cacheService.releaseLock(chargeKey);
    }
  }

  private digestUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private registerPublishExecutor(): void {
    const postsService = this.postsService;
    const credentialsService = this.credentialsService;
    const executor = createPublishExecutor(
      async ({
        brandId,
        caption,
        media,
        organizationId,
        platforms,
        scheduledFor,
        targetKeyword,
        triggerSeoOptimization,
        userId,
        workflowId,
      }) => {
        if (!postsService || !credentialsService) {
          return {
            platforms,
            postIds: [],
            scheduledFor,
            status: scheduledFor ? 'scheduled' : 'queued',
          };
        }

        const postIds: string[] = [];
        const publishedPlatforms: SocialPlatform[] = [];
        const ingredients = this.extractPublishIngredientIds(media);

        for (const platform of platforms) {
          const credential = await credentialsService.findOne({
            brand: brandId,
            isConnected: true,
            isDeleted: false,
            organization: organizationId,
            platform: platform as CredentialPlatform,
          });

          if (!credential) {
            continue;
          }

          const post = await postsService.create({
            brand: brandId,
            category:
              ingredients.length > 0 ? PostCategory.IMAGE : PostCategory.TEXT,
            credential: credential._id,
            description: caption,
            ingredients,
            label: this.buildPostLabel(caption),
            organization: organizationId,
            platform: credential.platform as CredentialPlatform,
            scheduledDate: scheduledFor ?? undefined,
            status: scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
            user: userId,
          });

          postIds.push(post._id.toString());
          publishedPlatforms.push(platform);
        }

        // Opt-in, loop-safe: only emit for immediate publishes that actually
        // created posts, so an SEO-optimization workflow can run on the content.
        if (triggerSeoOptimization && !scheduledFor && postIds.length > 0) {
          // Guard: if the current workflow is itself rooted at a
          // `postPublishTrigger` node, re-emitting `post-published` would route
          // back to the same workflow and create an infinite trigger loop.
          // Fetch the workflow's node list and skip the emit when a
          // postPublishTrigger node is present.
          let isPostPublishWorkflow = false;
          if (this.prismaService && workflowId) {
            try {
              const workflowDoc = await this.prismaService.workflow.findFirst({
                select: { nodes: true },
                where: { id: workflowId, isDeleted: false },
              });
              const nodes = Array.isArray(workflowDoc?.nodes)
                ? (workflowDoc.nodes as Array<{ type?: string }>)
                : [];
              isPostPublishWorkflow = nodes.some(
                (n) => n.type === 'postPublishTrigger',
              );
            } catch {
              // Non-fatal: if the lookup fails, default to safe (no re-emit).
              isPostPublishWorkflow = true;
            }
          }

          if (isPostPublishWorkflow) {
            this.loggerService.debug(
              `${this.logContext} skipping post-published re-emit — workflow ${workflowId} is itself a postPublishTrigger workflow`,
              { organizationId, workflowId },
            );
          } else {
            await this.emitPostPublishedEvent({
              brandId,
              caption,
              organizationId,
              platforms: publishedPlatforms,
              postIds,
              status: 'queued',
              targetKeyword: targetKeyword ?? null,
              userId,
            });
          }
        }

        return {
          platforms: publishedPlatforms,
          postIds,
          scheduledFor,
          status: scheduledFor ? 'scheduled' : 'queued',
        };
      },
    );
    this.engine.registerExecutor(
      executor.nodeType,
      this.wrapEngineExecutor(executor),
    );
  }

  private createEmptyAnalyticsFeedback(): AnalyticsFeedbackOutput {
    return {
      avgEngagementRate: 0,
      bestPlatform: null,
      bestPostingTimes: [],
      topHooks: [],
      topTopics: [],
      weekOverWeekChange: 0,
      weekOverWeekDirection: 'stable',
      worstTopics: [],
    };
  }

  private async findTrendFromSocialKeywordMatch(params: {
    organizationId: string;
    platform: TrendPlatform;
    minViralScore: number;
    keywords: string[];
    excludeKeywords: string[];
    lastTrendId: string | null;
  }): Promise<TrendTriggerOutput | null> {
    const keywordPlatform = this.toKeywordTriggerPlatform(params.platform);
    if (
      !keywordPlatform ||
      !this.socialAdapterFactory?.isSupported(params.platform)
    ) {
      return null;
    }

    const checker = this.socialAdapterFactory
      .getAdapter(params.platform)
      .createKeywordChecker?.();

    if (!checker) {
      return null;
    }

    const match = await checker({
      caseSensitive: false,
      excludeKeywords: params.excludeKeywords,
      keywords: params.keywords,
      lastPostId: params.lastTrendId,
      matchMode: 'contains',
      organizationId: params.organizationId,
      platform: keywordPlatform,
    });

    if (!match) {
      return null;
    }

    return {
      hashtags: [match.matchedKeyword]
        .filter(Boolean)
        .map((keyword) => this.buildHashtag(keyword)),
      platform: params.platform,
      soundId: null,
      topic: match.matchedKeyword,
      trendId: match.postId,
      videoUrl: match.postUrl,
      viralScore: params.minViralScore,
    };
  }

  private toKeywordTriggerPlatform(
    platform: TrendPlatform,
  ): KeywordTriggerPlatform | null {
    if (platform === 'twitter' || platform === 'instagram') {
      return platform;
    }

    return null;
  }

  private registerPromptConstructorExecutor(): void {
    const promptConstructorExecutor = createPromptConstructorExecutor();

    this.engine.registerExecutor(
      'promptConstructor',
      this.wrapEngineExecutor(promptConstructorExecutor),
    );
  }

  private registerHookGeneratorExecutor(): void {
    const hookGeneratorExecutor = createHookGeneratorExecutor();

    this.engine.registerExecutor(
      'hookGenerator',
      this.wrapEngineExecutor(hookGeneratorExecutor),
    );
  }

  private registerLlmExecutor(): void {
    const openRouterService = this.openRouterService;

    this.engine.registerExecutor('llm', async (node, inputs) => {
      if (!openRouterService) {
        throw new Error('OpenRouter service is not available for llm nodes');
      }

      const promptInput = inputs.get('prompt');
      const prompt =
        typeof promptInput === 'string' && promptInput.trim().length > 0
          ? promptInput
          : this.readConfigString(node.config, 'prompt');

      if (!prompt) {
        throw new Error('Missing required input: prompt');
      }

      const response = await openRouterService.chatCompletion({
        max_tokens: Math.round(
          this.getOptionalNumberConfig(node.config, 'maxTokens', 1024),
        ),
        messages: [{ content: prompt, role: 'user' }],
        model:
          this.readConfigString(node.config, 'model') ?? 'openai/gpt-4o-mini',
        temperature: this.getOptionalNumberConfig(
          node.config,
          'temperature',
          0.8,
        ),
      });
      const content = response.choices[0]?.message?.content?.trim() ?? '';

      if (!content) {
        throw new Error('LLM executor returned empty content');
      }

      return { content, model: response.model };
    });
  }

  /**
   * Registers all social workflow executors with their platform adapters.
   * Uses the SocialAdapterFactory to wire platform-specific implementations.
   * If the factory is not available, executors are registered without adapters
   * (they will throw at runtime if invoked).
   */
  private registerSocialExecutors(): void {
    const platforms = this.socialAdapterFactory?.getSupportedPlatforms() ?? [];

    // Register one executor per social node type.
    // The executor's platform is resolved at execution time from node config,
    // so we register a single executor per type that dispatches to the correct adapter.
    const postReplyExecutor = createPostReplyExecutor();
    const sendDmExecutor = createSendDmExecutor();
    const followerTriggerExecutor = createNewFollowerTriggerExecutor();
    const mentionTriggerExecutor = createMentionTriggerExecutor();
    const likeTriggerExecutor = createNewLikeTriggerExecutor();
    const repostTriggerExecutor = createNewRepostTriggerExecutor();

    if (this.socialAdapterFactory && platforms.length > 0) {
      const socialAdapterFactory = this.socialAdapterFactory;

      // Wire dispatching publishers/checkers that route to the correct platform adapter
      postReplyExecutor.setPublisher((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createReplyPublisher()(params);
      });

      sendDmExecutor.setSender((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createDmSender()(params);
      });

      followerTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createFollowerChecker()(params);
      });

      mentionTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createMentionChecker()(params);
      });

      likeTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createLikeChecker()(params);
      });

      repostTriggerExecutor.setChecker((params) => {
        const adapter = socialAdapterFactory.getAdapter(params.platform);
        return adapter.createRepostChecker()(params);
      });

      this.loggerService.log(
        `${this.logContext} social executors wired for platforms: ${platforms.join(', ')}`,
      );
    }

    // Wrap class executors as NodeExecutor functions
    this.engine.registerExecutor(
      postReplyExecutor.nodeType,
      this.wrapEngineExecutor(postReplyExecutor),
    );
    this.engine.registerExecutor(
      sendDmExecutor.nodeType,
      this.wrapEngineExecutor(sendDmExecutor),
    );
    this.engine.registerExecutor(
      followerTriggerExecutor.nodeType,
      this.wrapEngineExecutor(followerTriggerExecutor),
    );
    this.engine.registerExecutor(
      mentionTriggerExecutor.nodeType,
      this.wrapEngineExecutor(mentionTriggerExecutor),
    );
    this.engine.registerExecutor(
      likeTriggerExecutor.nodeType,
      this.wrapEngineExecutor(likeTriggerExecutor),
    );
    this.engine.registerExecutor(
      repostTriggerExecutor.nodeType,
      this.wrapEngineExecutor(repostTriggerExecutor),
    );
  }

  /**
   * Registers the lip sync executor with HeyGen as the backend provider.
   */
  private registerLipSyncExecutor(): void {
    const lipSyncExecutor = createLipSyncExecutor();

    if (this.heyGenService && this.metadataService) {
      const heyGenService = this.heyGenService;

      lipSyncExecutor.setResolver(
        async (mediaUrl, audioUrl, _options, context, node) => {
          const parentIngredientId = this.extractIngredientId(mediaUrl);
          const audioIngredientId = this.extractIngredientId(audioUrl);
          const brandId = await this.resolveBrandIdFromInputOrFail(
            this.readConfigString(node?.config, 'brandId'),
            mediaUrl,
            'lipSync',
          );
          const pendingOutput = await this.createWorkflowOutputIngredient({
            brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            model: MODEL_KEYS.HEYGEN_AVATAR,
            organizationId: context.organizationId,
            parentIngredientId,
            references: [parentIngredientId, audioIngredientId],
            transformations: [TransformationCategory.LIP_SYNCED],
            userId: context.userId,
          });
          const videoId = await heyGenService.generatePhotoAvatarVideo(
            pendingOutput.ingredientId,
            mediaUrl,
            audioUrl,
          );

          await this.metadataService?.patch(
            pendingOutput.metadataId,
            new MetadataEntity({
              externalId: videoId,
              result: this.buildVideoIngredientUrl(pendingOutput.ingredientId),
            }),
          );

          return {
            id: pendingOutput.ingredientId,
            status: IngredientStatus.PROCESSING,
            videoUrl: this.buildVideoIngredientUrl(pendingOutput.ingredientId),
          };
        },
      );

      this.loggerService.log(
        `${this.logContext} lip sync executor wired with HeyGen`,
      );
    }

    this.engine.registerExecutor(
      lipSyncExecutor.nodeType,
      this.wrapEngineExecutor(lipSyncExecutor),
    );
  }

  private registerAvatarVideoExecutor(): void {
    const avatarVideoGenerationService = this.avatarVideoGenerationService;

    if (!avatarVideoGenerationService) {
      return;
    }

    this.engine.registerExecutor(
      'aiAvatarVideo',
      async (_node, inputs, context) => {
        const script = this.getRequiredStringInput(inputs, 'script');
        const result = await avatarVideoGenerationService.generateAvatarVideo(
          {
            aspectRatio: this.getAspectRatioConfig(_node.config.aspectRatio),
            audioUrl: this.getOptionalStringInput(inputs, 'audioUrl'),
            clonedVoiceId: this.getOptionalStringInput(inputs, 'clonedVoiceId'),
            photoUrl: this.getOptionalStringInput(inputs, 'photoUrl'),
            text: script,
            useIdentity:
              _node.config.useIdentityDefaults === undefined
                ? true
                : Boolean(_node.config.useIdentityDefaults),
          },
          {
            brandId: this.readConfigString(_node.config, 'brandId'),
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );

        return {
          externalId: result.externalId,
          id: result.ingredientId,
          status: result.status,
          video: {
            externalId: result.externalId,
            id: result.ingredientId,
            status: result.status,
          },
        };
      },
    );
  }

  private registerCaptionsExecutor(): void {
    const captionsService = this.captionsService;
    const fileQueueService = this.fileQueueService;
    const filesClientService = this.filesClientService;
    const ingredientsService = this.ingredientsService;
    const metadataService = this.metadataService;
    const sharedService = this.sharedService;
    const whisperService = this.whisperService;

    if (
      !captionsService ||
      !fileQueueService ||
      !filesClientService ||
      !ingredientsService ||
      !metadataService ||
      !sharedService ||
      !whisperService
    ) {
      return;
    }

    this.engine.registerExecutor(
      'effect-captions',
      async (node, inputs, context) => {
        const brandId = this.getRequiredBrandId(node);
        const sourceVideo = this.getVideoResultInput(inputs, 'video');
        const sourceIngredientId = this.extractIngredientId(sourceVideo);

        if (!sourceIngredientId) {
          throw new Error(
            'effect-captions requires a source video ingredient id',
          );
        }

        const captionContent =
          await whisperService.generateCaptions(sourceIngredientId);

        await captionsService.create(
          new CaptionEntity({
            content: captionContent,
            format: CaptionFormat.SRT,
            ingredient: sourceIngredientId,
            isDeleted: false,
            language: CaptionLanguage.EN,
            user: context.userId,
          }),
        );

        const { ingredientData, metadataData } =
          await sharedService.saveDocumentsInternal({
            brand: brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            organization: context.organizationId,
            parent: sourceIngredientId,
            status: IngredientStatus.PROCESSING,
            user: context.userId,
          });

        const ingredientId = ingredientData._id.toString();
        const job = await fileQueueService.processVideo({
          authProviderUserId: context.userId,
          ingredientId,
          organizationId: context.organizationId,
          params: {
            captionContent,
            inputPath: `${this.configService.ingredientsEndpoint}/videos/${sourceIngredientId}`,
          },
          room: getUserRoomName(context.userId),
          type: 'add-captions',
          userId: context.userId,
          websocketUrl: `/videos/${ingredientId}`,
        });

        const result = await fileQueueService.waitForJob(job.jobId, 180_000);
        const outputPath = this.getRequiredJobOutputPath(result);

        const uploaded = await filesClientService.uploadToS3(
          ingredientId,
          'videos',
          {
            path: outputPath,
            type: FileInputType.FILE,
          },
        );

        await ingredientsService.patch(ingredientId, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.CAPTIONED],
        });
        await metadataService.patch(
          metadataData._id,
          new MetadataEntity(uploaded),
        );

        return {
          id: ingredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.buildVideoIngredientUrl(ingredientId),
        };
      },
    );
  }

  private registerMusicSourceExecutor(): void {
    const musicsService = this.musicsService;

    if (!musicsService) {
      return;
    }

    this.engine.registerExecutor(
      'musicSource',
      async (node, inputs, context) => {
        const sourceType =
          (node.config.sourceType as MusicSourceType | undefined) ??
          MusicSourceType.LIBRARY;

        if (sourceType !== MusicSourceType.LIBRARY) {
          const uploadedUrl = this.getOptionalStringInput(inputs, 'uploadUrl');
          const generatedPrompt = this.getOptionalStringInput(
            inputs,
            'generatePrompt',
          );

          return {
            musicUrl: uploadedUrl ?? generatedPrompt ?? null,
            sourceType,
          };
        }

        const brandId = this.getRequiredBrandId(node);
        const music =
          (await musicsService.findOne({
            brand: brandId,
            isDeleted: false,
            organization: context.organizationId,
            status: IngredientStatus.GENERATED,
          })) ??
          (await musicsService.findOne({
            isDeleted: false,
            organization: context.organizationId,
            status: IngredientStatus.GENERATED,
          }));

        const musicId = this.getDocumentId(music);

        if (!music || !musicId) {
          throw new Error(
            'No generated music is available for this organization',
          );
        }

        return {
          musicIngredientId: musicId,
          musicUrl: this.buildMusicIngredientUrl(musicId),
          sourceType,
        };
      },
    );
  }

  private registerSoundOverlayExecutor(): void {
    const videoMusicOrchestrationService = this.videoMusicOrchestrationService;

    if (!videoMusicOrchestrationService) {
      return;
    }

    this.engine.registerExecutor(
      'soundOverlay',
      async (node, inputs, context) => {
        const brandId = this.getRequiredBrandId(node);
        const sourceVideo = this.getVideoResultInput(inputs, 'videoUrl');
        const videoIngredientId = this.extractIngredientId(sourceVideo);

        if (!videoIngredientId) {
          throw new Error('soundOverlay requires a source video ingredient id');
        }

        const soundSource = inputs.get('soundUrl');
        const musicIngredientId = this.extractMusicIngredientId(soundSource);

        if (!musicIngredientId) {
          throw new Error(
            'soundOverlay requires a library music ingredient from musicSource',
          );
        }

        const mergedIngredientId =
          await videoMusicOrchestrationService.mergeVideoWithMusic(
            videoIngredientId,
            musicIngredientId,
            this.getOptionalNumberConfig(node.config, 'audioVolume', 30),
            false,
            {
              brandId,
              authProviderUserId: context.userId,
              organizationId: context.organizationId,
              userId: context.userId,
            },
          );

        return {
          id: mergedIngredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.buildVideoIngredientUrl(mergedIngredientId),
        };
      },
    );
  }

  private registerPostExecutor(): void {
    const postsService = this.postsService;
    const credentialsService = this.credentialsService;
    const openRouterService = this.openRouterService;

    if (!postsService || !credentialsService || !openRouterService) {
      return;
    }

    this.engine.registerExecutor('postGen', async (node, _inputs, context) => {
      const brandId = this.readConfigString(node.config, 'brandId');
      const prompt = this.readConfigString(node.config, 'prompt');

      if (!brandId || !prompt) {
        throw new Error('postGen requires brandId and prompt');
      }

      const credentialId = this.readConfigString(node.config, 'credentialId');
      const brandLabel =
        this.readConfigString(node.config, 'brandLabel') ?? 'the brand';
      const timezone = this.readConfigString(node.config, 'timezone') ?? 'UTC';

      const credentialQuery: Record<string, unknown> = {
        brand: brandId,
        isConnected: true,
        isDeleted: false,
        organization: context.organizationId,
      };

      if (credentialId) {
        credentialQuery._id = credentialId;
      }

      const credential = await credentialsService.findOne(credentialQuery);

      if (!credential) {
        return {
          reason: 'missing_connected_credential',
          status: 'skipped',
        };
      }

      const completion = await openRouterService.chatCompletion({
        max_tokens: 500,
        messages: [
          {
            content:
              'You write concise, production-ready social media drafts. Return only the post body with no preamble.',
            role: 'system',
          },
          {
            content: [
              `Brand: ${brandLabel}`,
              `Prompt: ${prompt}`,
              'Write one clear social post draft that is specific and ready for review.',
            ].join('\n\n'),
            role: 'user',
          },
        ],
        model: 'openai/gpt-4o-mini',
        temperature: 0.6,
      });

      const description =
        completion.choices?.[0]?.message?.content?.trim() ??
        `Daily post draft for ${brandLabel}`;

      const post = await postsService.create({
        brand: brandId,
        category: PostCategory.TEXT,
        credential: credential._id,
        description,
        ingredients: [],
        label: this.buildPostLabel(description),
        organization: context.organizationId,
        platform: credential.platform as CredentialPlatform,
        status: PostStatus.DRAFT,
        timezone,
        user: context.userId,
      });

      return {
        description: post.description,
        id: post._id.toString(),
        platform: post.platform,
        post: {
          id: post._id.toString(),
          label: post.label,
          status: post.status,
        },
        status: post.status,
      };
    });
  }

  private registerNewsletterExecutor(): void {
    const newslettersService = this.newslettersService;

    if (!newslettersService) {
      return;
    }

    this.engine.registerExecutor(
      'newsletterGen',
      async (node, _inputs, context) => {
        const brandId = this.readConfigString(node.config, 'brandId');
        const prompt = this.readConfigString(node.config, 'prompt');

        if (!brandId || !prompt) {
          throw new Error('newsletterGen requires brandId and prompt');
        }

        const instructions = this.readConfigString(node.config, 'instructions');

        const newsletter = await newslettersService.generateDraft(
          {
            instructions,
            topic: prompt,
          },
          {
            brandId,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );

        return {
          id: newsletter._id.toString(),
          newsletter: {
            id: newsletter._id.toString(),
            label: newsletter.label,
            status: newsletter.status,
            topic: newsletter.topic,
          },
          status: newsletter.status,
          topic: newsletter.topic,
        };
      },
    );
  }

  /**
   * Registers the text-to-speech executor with ElevenLabs as the backend provider.
   */
  private registerTextToSpeechExecutor(): void {
    const ttsExecutor = createTextToSpeechExecutor();

    if (
      this.elevenLabsService &&
      this.sharedService &&
      this.metadataService &&
      this.ingredientsService
    ) {
      const elevenLabsService = this.elevenLabsService;

      ttsExecutor.setResolver(async (text, voiceId, context, node) => {
        const brandId = this.requireBrandId(
          this.readConfigString(node.config, 'brandId'),
          'textToSpeech',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
          brandId,
          category: IngredientCategory.MUSIC,
          extension: MetadataExtension.MP3,
          organizationId: context.organizationId,
          userId: context.userId,
        });
        const result = await elevenLabsService.generateAndUploadAudio(
          voiceId,
          text,
          pendingOutput.ingredientId,
        );

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            ...result.uploadResult,
            duration: result.duration,
            result: result.audioUrl,
          }),
        );
        await this.ingredientsService?.patch(pendingOutput.ingredientId, {
          status: IngredientStatus.GENERATED,
        });

        return {
          audioUrl: this.buildMusicIngredientUrl(pendingOutput.ingredientId),
          duration: result.duration,
          id: pendingOutput.ingredientId,
          status: IngredientStatus.GENERATED,
        };
      });

      this.loggerService.log(
        `${this.logContext} text-to-speech executor wired with ElevenLabs`,
      );
    }

    this.engine.registerExecutor(
      ttsExecutor.nodeType,
      this.wrapEngineExecutor(ttsExecutor),
    );
  }

  /**
   * Registers the reframe executor with Replicate (Luma) as the backend provider.
   */
  private registerReframeExecutor(): void {
    const reframeExecutor = createReframeExecutor();

    if (this.replicateService && this.metadataService) {
      const replicateService = this.replicateService;

      reframeExecutor.setResolver(async (mediaUrl, params, context, node) => {
        const outputCategory = this.resolveMediaOutputCategory(mediaUrl);
        const isVideo = outputCategory === IngredientCategory.VIDEO;
        const model =
          outputCategory === IngredientCategory.VIDEO
            ? MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO
            : MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE;
        const inputKey = isVideo ? 'video' : 'image';
        const parentIngredientId = this.extractIngredientId(mediaUrl);
        const brandId = await this.resolveBrandIdFromInputOrFail(
          this.readConfigString(node.config, 'brandId'),
          mediaUrl,
          'reframe',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
          brandId,
          category: outputCategory,
          extension:
            outputCategory === IngredientCategory.VIDEO
              ? MetadataExtension.MP4
              : MetadataExtension.JPG,
          model,
          organizationId: context.organizationId,
          parentIngredientId,
          transformations: [TransformationCategory.REFRAMED],
          userId: context.userId,
        });

        const predictionId = await replicateService.runModel(model, {
          [inputKey]: mediaUrl,
          aspect_ratio: params.targetAspectRatio,
        });

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            externalId: predictionId,
            result: this.buildMediaIngredientUrl(
              pendingOutput.ingredientId,
              outputCategory,
            ),
          }),
        );

        return {
          format:
            outputCategory === IngredientCategory.VIDEO ? 'video' : 'image',
          id: pendingOutput.ingredientId,
          mediaUrl: this.buildMediaIngredientUrl(
            pendingOutput.ingredientId,
            outputCategory,
          ),
          status: IngredientStatus.PROCESSING,
          targetAspectRatio: params.targetAspectRatio,
        };
      });

      this.loggerService.log(
        `${this.logContext} reframe executor wired with Replicate (Luma)`,
      );
    }

    this.engine.registerExecutor(
      reframeExecutor.nodeType,
      this.wrapEngineExecutor(reframeExecutor),
    );
  }

  /**
   * Registers the upscale executor with Replicate (Topaz) as the backend provider.
   */
  private registerUpscaleExecutor(): void {
    const upscaleExecutor = createUpscaleExecutor();

    if (this.replicateService && this.metadataService) {
      const replicateService = this.replicateService;

      upscaleExecutor.setResolver(async (mediaUrl, params, context, node) => {
        const outputCategory = this.resolveMediaOutputCategory(mediaUrl);
        const isVideo = outputCategory === IngredientCategory.VIDEO;
        const model = isVideo
          ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
          : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE;
        const inputKey = isVideo ? 'video' : 'image';
        const parentIngredientId = this.extractIngredientId(mediaUrl);
        const brandId = await this.resolveBrandIdFromInputOrFail(
          this.readConfigString(node.config, 'brandId'),
          mediaUrl,
          'upscale',
        );
        const pendingOutput = await this.createWorkflowOutputIngredient({
          brandId,
          category: outputCategory,
          extension: isVideo ? MetadataExtension.MP4 : MetadataExtension.JPG,
          model,
          organizationId: context.organizationId,
          parentIngredientId,
          transformations: [TransformationCategory.UPSCALED],
          userId: context.userId,
        });

        const input: Record<string, unknown> = {
          [inputKey]: mediaUrl,
        };

        if (!isVideo) {
          input.upscale_factor = params.scale;
        }

        const predictionId = await replicateService.runModel(model, input);

        await this.metadataService?.patch(
          pendingOutput.metadataId,
          new MetadataEntity({
            externalId: predictionId,
            result: this.buildMediaIngredientUrl(
              pendingOutput.ingredientId,
              outputCategory,
            ),
          }),
        );

        return {
          id: pendingOutput.ingredientId,
          mediaUrl: this.buildMediaIngredientUrl(
            pendingOutput.ingredientId,
            outputCategory,
          ),
          model: params.model,
          scale: params.scale,
          status: IngredientStatus.PROCESSING,
        };
      });

      this.loggerService.log(
        `${this.logContext} upscale executor wired with Replicate (Topaz)`,
      );
    }

    this.engine.registerExecutor(
      upscaleExecutor.nodeType,
      this.wrapEngineExecutor(upscaleExecutor),
    );
  }

  /**
   * Registers a NestJS service method as a node executor.
   */
  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.engine.registerExecutor(nodeType, executor);
    this.loggerService.debug(
      `${this.logContext} registered executor for ${nodeType}`,
    );
  }

  /**
   * Converts a workflow record to the engine-compatible format.
   */
  convertToExecutableWorkflow(
    workflowDoc: WorkflowDocumentShape,
  ): ExecutableWorkflow {
    const primaryBrandId =
      workflowDoc.brands && workflowDoc.brands.length > 0
        ? workflowDoc.brands[0]?.toString()
        : undefined;
    const nodes: ExecutableNode[] = (workflowDoc.nodes || []).map((node) => {
      const config =
        node.data?.config ||
        (node as unknown as { config?: Record<string, unknown> }).config ||
        {};
      const inputVariableKeys = (
        node.data as unknown as { inputVariableKeys?: unknown } | undefined
      )?.inputVariableKeys;
      const nodeConfig = Array.isArray(inputVariableKeys)
        ? { ...config, inputVariableKeys }
        : config;

      return {
        cachedOutput: (node as unknown as { cachedOutput?: unknown })
          .cachedOutput,
        config: this.withWorkflowBrandId(node.type, nodeConfig, primaryBrandId),
        id: node.id,
        inputs: (node as unknown as { inputs?: string[] }).inputs || [],
        isLocked: workflowDoc.lockedNodeIds?.includes(node.id) || false,
        label: node.data?.label || node.type,
        type: NODE_TYPE_TO_EXECUTOR[node.type] || node.type,
      };
    });

    const edges: ExecutableEdge[] = (workflowDoc.edges || []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    }));

    return {
      edges,
      id:
        typeof workflowDoc._id === 'object' && workflowDoc._id
          ? workflowDoc._id.toString()
          : workflowDoc.id || '',
      lockedNodeIds: workflowDoc.lockedNodeIds || [],
      nodes,
      organizationId:
        typeof workflowDoc.organization === 'object' && workflowDoc.organization
          ? workflowDoc.organization.toString()
          : '',
      userId:
        typeof workflowDoc.user === 'object' && workflowDoc.user
          ? workflowDoc.user.toString()
          : '',
    };
  }

  private withWorkflowBrandId(
    nodeType: string,
    config: Record<string, unknown>,
    brandId: string | undefined,
  ): Record<string, unknown> {
    const canonicalNodeType = normalizeWorkflowNodeTypeToCanonical(nodeType);

    if (
      !brandId ||
      ![
        'ai-avatar-video',
        'ai-generate-image',
        'analytics-feedback',
        'analyticsFeedback',
        'brandContext',
        'effect-captions',
        'imageGen',
        'ai-text-to-speech',
        'musicSource',
        'soundOverlay',
      ].includes(canonicalNodeType) ||
      typeof config.brandId === 'string'
    ) {
      return config;
    }

    return { ...config, brandId };
  }

  private extractMediaPreview(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'string') {
        return candidate;
      }
    }

    return null;
  }

  private extractReviewGateInput(
    inputs: Map<string, unknown>,
    kind: 'caption' | 'media',
  ): unknown {
    const directValue = inputs.get(kind);
    if (directValue !== undefined) {
      return directValue;
    }

    for (const value of inputs.values()) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const record = value as Record<string, unknown>;
      if (kind === 'caption') {
        if (typeof record.caption === 'string') {
          return record.caption;
        }
        if (typeof record.text === 'string') {
          return record.text;
        }
        continue;
      }

      if (record.media !== undefined) {
        return record.media;
      }
      for (const key of ['imageUrl', 'videoUrl', 'mediaUrl', 'url']) {
        if (record[key] !== undefined) {
          return record[key];
        }
      }
    }

    return undefined;
  }

  applyRuntimeInputValues(
    workflowDoc: {
      inputVariables?: WorkflowInputVariable[];
      nodes?: WorkflowVisualNode[];
    },
    executableWorkflow: ExecutableWorkflow,
    inputValues: Record<string, unknown> = {},
  ): ExecutableWorkflow {
    const workflowInputNodes = new Map(
      (workflowDoc.nodes ?? [])
        .filter((node) => isWorkflowInputNodeType(node.type))
        .map((node) => [node.id, node]),
    );
    const requiredInputs = new Set(
      (workflowDoc.inputVariables ?? [])
        .filter((variable) => variable.required)
        .map((variable) => variable.key),
    );
    const inputVariableDefaults = new Map(
      (workflowDoc.inputVariables ?? []).map((variable) => [
        variable.key,
        variable.defaultValue,
      ]),
    );
    const lockedNodeIds = new Set(executableWorkflow.lockedNodeIds);

    const nodes = executableWorkflow.nodes
      .filter((node) => {
        if (!isWorkflowInputNodeType(node.type)) {
          return true;
        }

        const sourceNode = workflowInputNodes.get(node.id);
        const inputName =
          this.readConfigString(sourceNode?.data?.config, 'inputName') ??
          node.id;
        const defaultValue = sourceNode?.data?.config?.defaultValue;
        const value =
          inputValues[inputName] !== undefined
            ? inputValues[inputName]
            : defaultValue;

        if (value !== undefined) {
          node.cachedOutput = value;
          node.isLocked = true;
          lockedNodeIds.add(node.id);
          return true;
        }

        const isRequired =
          requiredInputs.has(inputName) ||
          sourceNode?.data?.config?.required === true;

        if (isRequired) {
          throw new Error(`Missing required workflow input: ${inputName}`);
        }

        return false;
      })
      .map((node) => {
        const nextNode = { ...node };
        const inputVariableKeys = Array.isArray(node.config.inputVariableKeys)
          ? node.config.inputVariableKeys.filter(
              (key): key is string => typeof key === 'string',
            )
          : [];

        if (
          inputVariableKeys.length > 0 &&
          !isWorkflowInputNodeType(nextNode.type)
        ) {
          nextNode.config = { ...node.config };

          for (const key of inputVariableKeys) {
            const value =
              inputValues[key] !== undefined
                ? inputValues[key]
                : inputVariableDefaults.get(key);

            if (value !== undefined) {
              nextNode.config[key] = value;
            }
          }
        }

        return nextNode;
      });

    const nodeIds = new Set(nodes.map((node) => node.id));

    return {
      ...executableWorkflow,
      edges: executableWorkflow.edges.filter(
        (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
      ),
      lockedNodeIds: Array.from(lockedNodeIds).filter((nodeId) =>
        nodeIds.has(nodeId),
      ),
      nodes,
    };
  }

  private getRequiredStringInput(
    inputs: Map<string, unknown>,
    key: string,
  ): string {
    const value = inputs.get(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    throw new Error(`Missing required input: ${key}`);
  }

  private getOptionalStringInput(
    inputs: Map<string, unknown>,
    key: string,
  ): string | undefined {
    const value = inputs.get(key);

    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private getAspectRatioConfig(value: unknown): '9:16' | '16:9' | '1:1' {
    if (value === '16:9' || value === '1:1') {
      return value;
    }

    return '9:16';
  }

  private getRequiredBrandId(node: ExecutableNode): string {
    return this.requireBrandId(
      this.readConfigString(node.config, 'brandId'),
      node.type,
    );
  }

  private getVideoResultInput(
    inputs: Map<string, unknown>,
    key: string,
  ): unknown {
    if (!inputs.has(key)) {
      throw new Error(`Missing required input: ${key}`);
    }

    return inputs.get(key);
  }

  private getOptionalNumberConfig(
    config: Record<string, unknown>,
    key: string,
    fallback: number,
  ): number {
    const value = config[key];
    return typeof value === 'number' ? value : fallback;
  }

  private async createWorkflowOutputIngredient(args: {
    brandId: string;
    category: IngredientCategory;
    extension: MetadataExtension;
    organizationId: string;
    userId: string;
    model?: string;
    parentIngredientId?: string;
    references?: Array<string | undefined>;
    transformations?: TransformationCategory[];
    externalId?: string | null;
  }): Promise<{ ingredientId: string; metadataId: string }> {
    if (
      !this.sharedService ||
      !this.metadataService ||
      !this.ingredientsService
    ) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocumentsInternal({
        brand: args.brandId,
        category: args.category,
        extension: args.extension,
        model: args.model,
        organization: args.organizationId,
        parent:
          args.parentIngredientId && true ? args.parentIngredientId : undefined,
        references: (args.references ?? [])
          .filter(
            (reference): reference is string =>
              typeof reference === 'string' && true,
          )
          .map((reference) => reference),
        status: IngredientStatus.PROCESSING,
        user: args.userId,
      });

    const ingredientId = ingredientData._id.toString();
    const metadataId = metadataData._id.toString();

    if (args.externalId) {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          externalId: args.externalId,
        }),
      );
    }

    if (args.transformations && args.transformations.length > 0) {
      await this.ingredientsService.patch(ingredientId, {
        transformations: args.transformations,
      });
    }

    return { ingredientId, metadataId };
  }

  private requireBrandId(configuredBrandId: unknown, nodeType: string): string {
    if (typeof configuredBrandId === 'string' && configuredBrandId.length > 0) {
      return configuredBrandId;
    }

    throw new Error(`${nodeType} requires a brandId in node config`);
  }

  private async resolveBrandIdFromInputOrFail(
    configuredBrandId: string | undefined,
    source: unknown,
    nodeType: string,
  ): Promise<string> {
    if (configuredBrandId) {
      return configuredBrandId;
    }

    const sourceIngredientId = this.extractIngredientId(source);
    if (sourceIngredientId && this.ingredientsService) {
      const sourceIngredient = await this.ingredientsService.findOne({
        _id: sourceIngredientId,
        isDeleted: false,
      });
      const sourceBrandId =
        this.getDocumentId(
          (sourceIngredient as unknown as { brand?: unknown })?.brand,
        ) ??
        (
          sourceIngredient as unknown as { brand?: { toString(): string } }
        )?.brand?.toString();

      if (sourceBrandId) {
        return sourceBrandId;
      }
    }

    throw new Error(
      `${nodeType} requires a brandId or source ingredient brand`,
    );
  }

  private resolveMediaOutputCategory(mediaValue: unknown): IngredientCategory {
    const mediaUrl =
      typeof mediaValue === 'string'
        ? mediaValue
        : (this.extractMediaUrl(mediaValue) ?? '');

    if (
      mediaUrl.includes('/videos/') ||
      mediaUrl.includes('.mp4') ||
      mediaUrl.includes('.mov') ||
      mediaUrl.includes('.webm')
    ) {
      return IngredientCategory.VIDEO;
    }

    return IngredientCategory.IMAGE;
  }

  private extractIngredientId(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const match = value.match(
        /\/(?:images|videos|musics|audios|avatars)\/([a-f\d]{24})(?:[/?#]|$)/i,
      );
      return match?.[1];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string') {
        return record.id;
      }

      const nestedVideo = record.video;
      if (nestedVideo && typeof nestedVideo === 'object') {
        const nestedRecord = nestedVideo as Record<string, unknown>;
        if (typeof nestedRecord.id === 'string') {
          return nestedRecord.id;
        }
      }

      const nestedMusic = record.music;
      if (nestedMusic && typeof nestedMusic === 'object') {
        const nestedRecord = nestedMusic as Record<string, unknown>;
        if (typeof nestedRecord.id === 'string') {
          return nestedRecord.id;
        }
      }
    }

    return undefined;
  }

  private extractMusicIngredientId(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.musicIngredientId === 'string') {
        return record.musicIngredientId;
      }
    }

    return undefined;
  }

  private resolveConfiguredMediaInput(
    node: ExecutableNode,
    defaultCategory: 'image' | 'video',
  ): string {
    const source = this.readConfigString(node.config, 'source') ?? 'library';
    const resolvedUrl =
      this.readConfigString(node.config, 'resolvedUrl') ??
      (source === 'url'
        ? this.readConfigString(node.config, 'url')
        : this.readConfigString(node.config, 'selectedResolvedUrl'));

    if (resolvedUrl) {
      return resolvedUrl;
    }

    const itemId = this.readConfigString(node.config, 'itemId');
    if (!itemId) {
      throw new Error(`${node.type} requires a selected media URL or itemId`);
    }

    const itemCategory =
      this.readConfigString(node.config, 'itemCategory') ?? defaultCategory;

    return this.buildMediaItemUrl(itemId, itemCategory, source);
  }

  private buildMusicIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/musics/${ingredientId}`;
  }

  private buildMediaIngredientUrl(
    ingredientId: string,
    category: IngredientCategory,
  ): string {
    if (category === IngredientCategory.VIDEO) {
      return this.buildVideoIngredientUrl(ingredientId);
    }

    return this.buildImageIngredientUrl(ingredientId);
  }

  private buildImageIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/images/${ingredientId}`;
  }

  private buildVideoIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
  }

  private buildLogoAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/logos/${assetId}`;
  }

  private buildBannerAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/banners/${assetId}`;
  }

  private buildReferenceAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/references/${assetId}`;
  }

  private buildMediaItemUrl(
    itemId: string,
    itemCategory: string,
    source: string,
  ): string {
    if (source === 'brand-references' || itemCategory === 'reference') {
      return this.buildReferenceAssetUrl(itemId);
    }

    if (itemCategory === 'video') {
      return this.buildVideoIngredientUrl(itemId);
    }

    return this.buildImageIngredientUrl(itemId);
  }

  private getRequiredJobOutputPath(result: unknown): string {
    if (result && typeof result === 'object') {
      const outputPath = (result as Record<string, unknown>).outputPath;

      if (typeof outputPath === 'string' && outputPath.length > 0) {
        return outputPath;
      }
    }

    throw new Error('Caption job completed without an outputPath');
  }

  private getDocumentId(document: unknown): string | undefined {
    if (!document || typeof document !== 'object') {
      return undefined;
    }

    const id = (document as { _id?: { toString(): string } | string })._id;
    if (typeof id === 'string') {
      return id;
    }

    if (id && typeof id === 'object' && 'toString' in id) {
      return id.toString();
    }

    return undefined;
  }

  private extractMediaUrl(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const candidates = [
      record.mediaUrl,
      record.imageUrl,
      record.videoUrl,
      record.audioUrl,
      (record.video as Record<string, unknown> | undefined)?.videoUrl,
    ];

    const firstUrl = candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0,
    );

    return firstUrl;
  }

  private readConfigString(
    config: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = config?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private buildPostLabel(description: string): string {
    const normalized = description.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 60) {
      return normalized;
    }

    return `${normalized.slice(0, 57).trimEnd()}...`;
  }

  private buildHashtag(value: string): string {
    const normalized = value
      .trim()
      .replace(/^#/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized ? `#${normalized}` : '#trend';
  }

  private extractPublishIngredientIds(media: unknown): string[] {
    if (Array.isArray(media)) {
      return media
        .flatMap((item) => this.extractPublishIngredientIds(item))
        .filter((id, index, ids) => ids.indexOf(id) === index);
    }

    if (typeof media === 'string') {
      return this.isPublishIngredientReference(media) ? [media] : [];
    }

    if (!media || typeof media !== 'object') {
      return [];
    }

    const record = media as Record<string, unknown>;
    const candidates = [
      record.id,
      record._id,
      record.ingredientId,
      record.url,
      record.src,
      record.secureUrl,
      record.videoUrl,
      record.imageUrl,
    ];

    return candidates
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .filter((candidate) => this.isPublishIngredientReference(candidate));
  }

  private isEntityId(value: string): boolean {
    return /^[a-f\d]{24}$/i.test(value);
  }

  private isPublishIngredientReference(value: string): boolean {
    return this.isEntityId(value) || /^https?:\/\//i.test(value);
  }

  /**
   * Converts step-based workflows to node/edge format.
   */
  convertStepsToExecutableWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    userId: string,
    organizationId: string,
  ): ExecutableWorkflow {
    const nodes: ExecutableNode[] = steps.map((step) => ({
      config: step.config || {},
      id: step.id,
      inputs: [],
      label: step.label,
      type: (step as unknown as { type?: string }).type || '',
    }));

    // Build edges from dependsOn relationships
    const edges: ExecutableEdge[] = [];
    for (const step of steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        for (const depId of step.dependsOn) {
          edges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            target: step.id,
          });
        }
      }
    }

    return {
      edges,
      id: workflowId,
      lockedNodeIds: [],
      nodes,
      organizationId,
      userId,
    };
  }

  /**
   * Executes a workflow using the workflow engine.
   * Supports both full and partial execution via options.nodeIds.
   */
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

  /**
   * Resumes a failed workflow execution from the failure point.
   */
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

  /**
   * Estimates credits for executing the given nodes.
   */
  estimateCredits(nodes: ExecutableNode[]): number {
    return this.engine.estimateCredits(nodes);
  }
}
