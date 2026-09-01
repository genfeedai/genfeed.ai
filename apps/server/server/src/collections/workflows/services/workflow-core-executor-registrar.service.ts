import { LLM_DEFAULTS } from '@genfeedai/constants';
import type { IBrandAgentVoice } from '@genfeedai/interfaces';
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
import { Injectable, Optional } from '@nestjs/common';
import type { Brand } from '@server/collections/brands/schemas/brand.schema';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@server/collections/brands/utils/brand-agent-config-resolution.util';
import { PerformanceSummaryService } from '@server/collections/content-performance/services/performance-summary.service';
import { WorkflowEngineExecutorHelperService } from '@server/collections/workflows/services/workflow-engine-executor-helper.service';
import { OpenRouterService } from '@server/services/integrations/openrouter/services/openrouter.service';
import { SeoScorerService } from '@server/services/seo/seo-scorer.service';

type WorkflowBrandContext = {
  brandId: string;
  colors: {
    background: string;
    primary: string;
    secondary: string;
  };
  fonts: string | null;
  label: string;
  models: {
    image: string | null;
    imageToVideo: string | null;
    music: string | null;
    video: string | null;
  };
  slug: string;
  voice: string | null;
  voiceConfig: IBrandAgentVoice | null;
};

const MAX_WORKFLOW_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const WORKFLOW_DELAY_UNIT_MS = {
  days: 24 * 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  minutes: 60 * 1000,
  seconds: 1000,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    const record = asRecord(current);
    return record[segment];
  }, value);
}

function isEmptyConditionValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(asRecord(value)).length === 0)
  );
}

function evaluateCondition(
  candidate: unknown,
  operator: string,
  expected: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return Object.is(candidate, expected);
    case 'notEquals':
      return !Object.is(candidate, expected);
    case 'greaterThan':
      return typeof candidate === 'number' &&
        typeof expected === 'number' &&
        Number.isFinite(candidate) &&
        Number.isFinite(expected)
        ? candidate > expected
        : false;
    case 'lessThan':
      return typeof candidate === 'number' &&
        typeof expected === 'number' &&
        Number.isFinite(candidate) &&
        Number.isFinite(expected)
        ? candidate < expected
        : false;
    case 'greaterThanOrEquals':
      return typeof candidate === 'number' &&
        typeof expected === 'number' &&
        Number.isFinite(candidate) &&
        Number.isFinite(expected)
        ? candidate >= expected
        : false;
    case 'lessThanOrEquals':
      return typeof candidate === 'number' &&
        typeof expected === 'number' &&
        Number.isFinite(candidate) &&
        Number.isFinite(expected)
        ? candidate <= expected
        : false;
    case 'contains':
      return typeof candidate === 'string'
        ? candidate.includes(String(expected ?? ''))
        : Array.isArray(candidate) && candidate.includes(expected);
    case 'notContains':
      return !evaluateCondition(candidate, 'contains', expected);
    case 'startsWith':
      return (
        typeof candidate === 'string' &&
        candidate.startsWith(String(expected ?? ''))
      );
    case 'endsWith':
      return (
        typeof candidate === 'string' &&
        candidate.endsWith(String(expected ?? ''))
      );
    case 'isTrue':
      return candidate === true;
    case 'isFalse':
      return candidate === false;
    case 'isEmpty':
      return isEmptyConditionValue(candidate);
    case 'isNotEmpty':
      return !isEmptyConditionValue(candidate);
    default:
      throw new Error(`Unsupported workflow condition operator: ${operator}`);
  }
}

function resolveDelayMs(config: Record<string, unknown>, now: Date): number {
  const mode = optionalString(config.mode) ?? 'fixed';
  let delayMs: number;
  if (mode === 'until') {
    const untilTime = optionalString(config.untilTime);
    if (!untilTime) {
      throw new Error('Workflow delay untilTime is required in until mode');
    }
    const untilMs = Date.parse(untilTime);
    if (!Number.isFinite(untilMs)) {
      throw new Error('Workflow delay untilTime must be a valid timestamp');
    }
    delayMs = Math.max(untilMs - now.getTime(), 0);
  } else if (mode === 'fixed') {
    const duration = config.duration;
    const unit = optionalString(config.unit) ?? 'minutes';
    const unitMs =
      WORKFLOW_DELAY_UNIT_MS[unit as keyof typeof WORKFLOW_DELAY_UNIT_MS];
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 0
    ) {
      throw new Error('Workflow delay duration must be a non-negative number');
    }
    if (!unitMs) {
      throw new Error(`Unsupported workflow delay unit: ${unit}`);
    }
    delayMs = duration * unitMs;
  } else {
    throw new Error(`Unsupported workflow delay mode: ${mode}`);
  }

  if (!Number.isSafeInteger(delayMs) || delayMs > MAX_WORKFLOW_DELAY_MS) {
    throw new Error(`Workflow delay may not exceed ${MAX_WORKFLOW_DELAY_MS}ms`);
  }
  return delayMs;
}

function toWorkflowBrandContext(brand: Brand): WorkflowBrandContext {
  const row = asRecord(brand);
  const effectiveVoice = resolveEffectiveBrandAgentConfig({ brand }).voice;

  return {
    brandId: String(row.id),
    colors: {
      background: String(row.backgroundColor ?? 'transparent'),
      primary: String(row.primaryColor ?? '#000000'),
      secondary: String(row.secondaryColor ?? '#FFFFFF'),
    },
    fonts: optionalString(row.fontFamily),
    label: String(row.label ?? ''),
    models: {
      image: optionalString(row.defaultImageModel),
      imageToVideo: optionalString(row.defaultImageToVideoModel),
      music: optionalString(row.defaultMusicModel),
      video: optionalString(row.defaultVideoModel),
    },
    slug: String(row.slug ?? ''),
    voice:
      optionalString(effectiveVoice?.style) ??
      optionalString(effectiveVoice?.tone),
    voiceConfig: effectiveVoice ?? null,
  };
}

@Injectable()
export class WorkflowCoreExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    _loggerService: LoggerService,
    @Optional() private readonly brandsService?: BrandsService,
    @Optional()
    private readonly performanceSummaryService?: PerformanceSummaryService,
    @Optional() private readonly openRouterService?: OpenRouterService,
    @Optional() private readonly seoScorerService?: SeoScorerService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerConditionExecutor(engine);
    this.registerDelayExecutor(engine);
    this.registerReviewGateExecutor(engine);
    this.registerBrandExecutor(engine);
    this.registerBrandAssetExecutor(engine);
    this.registerBrandContextExecutor(engine);
    this.registerAnalyticsFeedbackExecutor(engine);
    this.registerSeoExecutors(engine);
  }

  private registerConditionExecutor(engine: WorkflowEngine): void {
    engine.registerExecutor('condition', async (node, inputs) => {
      const source = inputs.get('value') ?? inputs.values().next().value;
      const field = optionalString(node.config.field);
      const customField = optionalString(node.config.customField);
      const path = field === 'custom' ? customField : field;
      const candidate = path ? readPath(source, path) : source;
      const operator = optionalString(node.config.operator) ?? 'equals';
      return {
        data: source,
        result: evaluateCondition(candidate, operator, node.config.value),
        value: candidate,
      };
    });
  }

  private registerDelayExecutor(engine: WorkflowEngine): void {
    engine.registerExecutor('delay', async (node, inputs) => {
      const now = new Date();
      const delayMs = resolveDelayMs(node.config, now);
      return {
        data: inputs.get('trigger') ?? inputs.values().next().value,
        delayMs,
        resumeAt: new Date(now.getTime() + delayMs).toISOString(),
      };
    });
  }

  private registerBrandExecutor(engine: WorkflowEngine): void {
    if (!this.brandsService) return;
    const brandsService = this.brandsService;
    const executor = createBrandExecutor(async (brandId, organizationId) => {
      const brand = await brandsService.findOne({
        id: brandId,
        organizationId,
      });
      if (!brand) return null;
      const context = toWorkflowBrandContext(brand);
      return {
        brandId: context.brandId,
        colors: context.colors,
        fonts: context.fonts,
        handle: context.slug,
        label: context.label,
        models: context.models,
        voice: context.voice,
      };
    });
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
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

        // Brand assets are Asset rows, not Brand columns — the resolver is the
        // only way to get a real URL. It scopes by org itself.
        const assets = await this.brandsService?.resolveBrandKitAssets(
          brandId,
          organizationId,
        );

        if (!assets) {
          return null;
        }

        if (assetType === 'logo' || assetType === 'banner') {
          const asset = assets[assetType];

          return {
            dimensions: null,
            mimeType: asset?.mimeType ?? null,
            url: asset?.url ?? null,
            urls: [],
          };
        }

        const urls = assets.references.map((reference) => reference.url);

        return {
          dimensions: null,
          mimeType: assets.references[0]?.mimeType ?? null,
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
        const brand = await brandsService.findOne({
          id: brandId,
          organizationId,
        });
        if (!brand) return null;
        return toWorkflowBrandContext(brand);
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
        model: model ?? LLM_DEFAULTS.fastText,
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
