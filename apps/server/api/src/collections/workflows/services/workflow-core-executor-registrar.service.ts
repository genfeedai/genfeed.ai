import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import type { AnalyticsFeedbackOutput } from '@genfeedai/workflows/engine';
import {
  createAnalyticsFeedbackExecutor,
  createBrandAssetExecutor,
  createBrandContextExecutor,
  createBrandExecutor,
  createIterativeSeoRefineExecutor,
  createSeoRewriteExecutor,
  createSeoScoreExecutor,
  PostPublishTriggerExecutor,
  type SeoRewriteResolver,
  type SeoScoreResolver,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';

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

export class WorkflowCoreExecutorRegistrarService {
  private readonly logContext = 'WorkflowEngineAdapterService';

  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    private readonly brandsService?: BrandsService,
    private readonly performanceSummaryService?: PerformanceSummaryService,
    private readonly openRouterService?: OpenRouterService,
    private readonly seoScorerService?: SeoScorerService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerFallbackExecutors(engine);
    this.registerReviewGateExecutor(engine);
    this.registerBrandExecutor(engine);
    this.registerBrandAssetExecutor(engine);
    this.registerBrandContextExecutor(engine);
    this.registerAnalyticsFeedbackExecutor(engine);
    this.registerSeoExecutors(engine);
  }

  private registerBrandExecutor(engine: WorkflowEngine): void {
    if (!this.brandsService) return;
    const brandsService = this.brandsService;
    const executor = createBrandExecutor(async (brandId, organizationId) => {
      const brand = await brandsService.findOne(
        { _id: brandId, isDeleted: false, organization: organizationId },
        ['detail'],
      );
      if (!brand) return null;
      const brandDoc = brand as unknown as Record<string, unknown>;
      return {
        brandId: String(brandDoc.id),
        colors:
          (brandDoc.colors as {
            primary: string;
            secondary: string;
            background: string;
          } | null) ?? null,
        fonts: (brandDoc.fonts as string | null) ?? null,
        handle: String(brandDoc.slug ?? brandDoc.handle ?? ''),
        label: String(brandDoc.name ?? brandDoc.label ?? ''),
        models: null,
        voice: (brandDoc.voice as string | null) ?? null,
      };
    });
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerFallbackExecutors(engine: WorkflowEngine): void {
    for (const nodeType of FALLBACK_EXECUTOR_TYPES) {
      engine.registerExecutor(nodeType, async (node, inputs, context) => {
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

  private registerReviewGateExecutor(engine: WorkflowEngine): void {
    engine.registerExecutor('reviewGate', async (_node, inputs) => {
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

  private registerBrandAssetExecutor(engine: WorkflowEngine): void {
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
          const logoId = this.helper.getDocumentId(
            (brand as unknown as { logo?: unknown }).logo,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: logoId ? this.helper.buildLogoAssetUrl(logoId) : null,
            urls: [],
          };
        }

        if (assetType === 'banner') {
          const bannerId = this.helper.getDocumentId(
            (brand as unknown as { banner?: unknown }).banner,
          );

          return {
            dimensions: null,
            mimeType: null,
            url: bannerId ? this.helper.buildBannerAssetUrl(bannerId) : null,
            urls: [],
          };
        }

        const references = Array.isArray(
          (brand as unknown as { references?: unknown[] }).references,
        )
          ? (brand as unknown as { references: unknown[] }).references
          : [];
        const urls = references
          .map((reference) => this.helper.getDocumentId(reference))
          .filter((id): id is string => typeof id === 'string')
          .map((id) => this.helper.buildReferenceAssetUrl(id));

        return {
          dimensions: null,
          mimeType: null,
          url: urls[0] ?? null,
          urls,
        };
      },
    );

    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerBrandContextExecutor(engine: WorkflowEngine): void {
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
          brandId: String(brandDoc.id),
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
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerAnalyticsFeedbackExecutor(engine: WorkflowEngine): void {
    const summaryService = this.performanceSummaryService;
    const executor = createAnalyticsFeedbackExecutor(
      async ({ organizationId, brandId, topN, worstN }) => {
        if (!summaryService) {
          return createEmptyAnalyticsFeedback();
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
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  private registerSeoExecutors(engine: WorkflowEngine): void {
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
        return { model: null, text: content };
      }

      const response = await openRouterService.chatCompletion({
        max_tokens: 2000,
        messages: buildSeoRewriteMessages({
          content,
          suggestions,
          targetKeyword: targetKeyword ?? undefined,
          title: title ?? undefined,
        }),
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
    engine.registerExecutor(
      seoScoreExecutor.nodeType,
      this.helper.wrapEngineExecutor(seoScoreExecutor),
    );

    const seoRewriteExecutor = createSeoRewriteExecutor(rewriteResolver);
    engine.registerExecutor(
      seoRewriteExecutor.nodeType,
      this.helper.wrapEngineExecutor(seoRewriteExecutor),
    );

    const iterativeSeoRefineExecutor = createIterativeSeoRefineExecutor(
      scoreResolver,
      rewriteResolver,
    );
    engine.registerExecutor(
      iterativeSeoRefineExecutor.nodeType,
      this.helper.wrapEngineExecutor(iterativeSeoRefineExecutor),
    );

    const postPublishTriggerExecutor = new PostPublishTriggerExecutor();
    engine.registerExecutor(
      postPublishTriggerExecutor.nodeType,
      this.helper.wrapEngineExecutor(postPublishTriggerExecutor),
    );
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
}

function createEmptyAnalyticsFeedback(): AnalyticsFeedbackOutput {
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

function buildSeoRewriteMessages(input: {
  content: string;
  suggestions: string[];
  targetKeyword?: string;
  title?: string;
}) {
  const systemPrompt =
    'You are an expert SEO editor. Rewrite the provided content to address ' +
    'the listed SEO suggestions while preserving the original meaning, tone, ' +
    'and factual accuracy. Return ONLY the rewritten content body (plain text ' +
    'or HTML matching the input) with no preamble or commentary.';

  const userPrompt = [
    input.title ? `Title: ${input.title}` : null,
    input.targetKeyword ? `Target keyword: ${input.targetKeyword}` : null,
    input.suggestions.length > 0
      ? `SEO suggestions to address:\n${input.suggestions
          .map((suggestion, index) => `${index + 1}. ${suggestion}`)
          .join('\n')}`
      : null,
    `Content:\n${input.content}`,
  ]
    .filter((section): section is string => section !== null)
    .join('\n\n');

  return [
    { content: systemPrompt, role: 'system' as const },
    { content: userPrompt, role: 'user' as const },
  ];
}
