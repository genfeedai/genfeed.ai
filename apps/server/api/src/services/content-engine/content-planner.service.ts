import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { type ContentPlanItemDocument } from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import {
  ContentPlanItemsService,
  type CreateContentPlanItemInput,
} from '@api/collections/content-plan-items/services/content-plan-items.service';
import { GenerateContentPlanDto } from '@api/collections/content-plans/dto/generate-content-plan.dto';
import { type ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import {
  type PlanPerformanceContext,
  PlanPerformanceContextService,
} from '@api/services/content-engine/plan-performance-context.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentPlanStatus } from '@genfeedai/contracts';
import {
  CONTENT_PLAN_GENERATION_SCHEMA_NAME,
  type ContentPlanGeneration,
  contentPlanGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const PLATFORM_FORMAT_GUIDANCE: Record<string, string> = {
  instagram: 'carousel (2-10 images) or reel (9:16 video under 90s)',
  linkedin: 'text-led post with a single supporting image',
  newsletter: 'long-form article with a hero image',
  pinterest: 'vertical image in a 2:3 ratio',
  tiktok: 'short-form vertical video (9:16, ideally under 60s)',
  twitter: 'text + image by default, use a thread when depth is needed',
  x: 'text + image by default, use a thread when depth is needed',
  youtube: 'long-form 16:9 video',
};

@Injectable()
export class ContentPlannerService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentPlansService: ContentPlansService,
    private readonly contentPlanItemsService: ContentPlanItemsService,
    private readonly brandsService: BrandsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly logger: LoggerService,
    private readonly planPerformanceContextService: PlanPerformanceContextService,
  ) {}

  async generatePlan(
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateContentPlanDto,
  ): Promise<{ plan: ContentPlanDocument; items: ContentPlanItemDocument[] }> {
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: organizationId,
    });

    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    const agentConfig =
      brand.agentConfig &&
      typeof brand.agentConfig === 'object' &&
      !Array.isArray(brand.agentConfig)
        ? (brand.agentConfig as BrandAgentConfig)
        : undefined;
    const voice = agentConfig?.voice;
    const strategy = agentConfig?.strategy;

    // Real performance grounding: own history (Genfeed + imported posts) when
    // there is enough of it, otherwise a cold-start brief from competitor ads,
    // creative patterns and followed creators.
    const performance = await this.planPerformanceContextService.build({
      brandId,
      organizationId,
      seeds: dto.seeds,
    });

    const systemPrompt = this.buildSystemPrompt(voice, strategy);
    const userPrompt = this.buildUserPrompt(dto, strategy, performance);

    const parsed: ContentPlanGeneration =
      await this.llmDispatcherService.completeStructured(
        {
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: LLM_DEFAULTS.planning,
          schema: contentPlanGenerationSchema,
          schemaName: CONTENT_PLAN_GENERATION_SCHEMA_NAME,
          temperature: 0.7,
        },
        organizationId,
      );

    const plan = await this.contentPlansService.createInternal({
      brandId,
      createdBy: userId,
      description: performance.isColdStart
        ? `AI-generated cold-start plan (seeded from competitor ads, creative patterns and followed creators; ${performance.dataset.totalPosts} own posts in the last 30 days): ${parsed.name}`
        : `AI-generated plan (grounded in ${performance.dataset.totalPosts} own posts, ${performance.dataset.importedPosts} imported): ${parsed.name}`,
      isDeleted: false,
      itemCount: parsed.items.length,
      name: dto.name ?? parsed.name,
      organizationId,
      periodEnd: new Date(dto.periodEnd),
      periodStart: new Date(dto.periodStart),
      seeds: {
        advertiserIds: dto.seeds?.advertiserIds ?? [],
        isColdStart: performance.isColdStart,
        isImportedHistoryIncluded: dto.seeds?.isImportedHistoryIncluded ?? true,
        isPatternsIncluded: dto.seeds?.isPatternsIncluded ?? true,
        sourceIds: dto.seeds?.sourceIds ?? [],
      },
      status: ContentPlanStatus.DRAFT,
    });

    const planId = String(plan.id);

    const itemInputs: CreateContentPlanItemInput[] = parsed.items.map(
      (item) => ({
        brandId,
        organizationId,
        pipelineSteps: item.pipelineSteps ?? undefined,
        planId,
        platforms: item.platforms ?? dto.platforms ?? [],
        prompt: item.prompt,
        scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : undefined,
        skillSlug: item.skillSlug ?? undefined,
        topic: item.topic,
        type: item.type,
      }),
    );

    const items = await this.contentPlanItemsService.createMany(itemInputs);

    this.logger.log(
      `${this.constructorName}: Generated plan with ${items.length} items`,
      {
        brandId,
        dataset: performance.dataset,
        isColdStart: performance.isColdStart,
        organizationId,
        planId,
      },
    );

    return { items, plan };
  }

  private buildSystemPrompt(
    voice?: {
      tone?: string;
      style?: string;
      audience?: string[];
      values?: string[];
    },
    strategy?: {
      contentTypes?: string[];
      platforms?: string[];
      frequency?: string;
      goals?: string[];
    },
  ): string {
    const voiceSection = voice
      ? `Brand Voice:
- Tone: ${voice.tone ?? 'professional'}
- Style: ${voice.style ?? 'informative'}
- Audience: ${voice.audience?.join(', ') ?? 'general'}
- Values: ${voice.values?.join(', ') ?? 'quality'}`
      : 'Brand Voice: Professional and engaging';

    const strategySection = strategy
      ? `Content Strategy:
- Types: ${strategy.contentTypes?.join(', ') ?? 'mixed'}
- Platforms: ${strategy.platforms?.join(', ') ?? 'instagram, twitter'}
- Frequency: ${strategy.frequency ?? 'daily'}
- Goals: ${strategy.goals?.join(', ') ?? 'engagement'}`
      : '';

    return `You are a content strategist AI. Generate a structured content plan.

${voiceSection}
${strategySection}

Each item needs a topic, a detailed content prompt, the target platforms and
an optional ISO \`scheduledAt\`.
For "skill" items set \`skillSlug\` (content-writing, image-generation or
trend-discovery). For "media_pipeline" items provide \`pipelineSteps\`, e.g.
{"type": "text-to-image", "model": "fal-ai/flux-pro/v1.1", "prompt": "...", "aspectRatio": "1:1"}.
Ensure content aligns with the brand voice and strategy.`;
  }

  private buildUserPrompt(
    dto: GenerateContentPlanDto,
    strategy?: {
      contentTypes?: string[];
      platforms?: string[];
      frequency?: string;
      goals?: string[];
    },
    performance?: PlanPerformanceContext,
  ): string {
    const itemCount = dto.itemCount ?? 7;
    const topics = dto.topics?.length
      ? `Focus on these topics: ${dto.topics.join(', ')}`
      : '';
    const platforms = dto.platforms?.length
      ? `Target platforms: ${dto.platforms.join(', ')}`
      : strategy?.platforms?.length
        ? `Target platforms: ${strategy.platforms.join(', ')}`
        : '';
    const platformGuidance = this.buildPlatformFormatGuidance(
      dto.platforms ?? strategy?.platforms,
    );
    const extra = dto.additionalInstructions
      ? `Additional instructions: ${dto.additionalInstructions}`
      : '';
    const performanceSection = performance?.section
      ? `\nPerformance grounding:\n${performance.section}\n`
      : '';

    return `Generate a content plan with ${itemCount} items for the period ${dto.periodStart} to ${dto.periodEnd}.
${topics}
${platforms}
${platformGuidance}
${extra}
${performanceSection}
Mix skill-based content (writing, trends) with media pipeline items (images, videos) for variety.`.trim();
  }

  private buildPlatformFormatGuidance(platforms?: string[]): string {
    if (!platforms || platforms.length === 0) {
      return '';
    }

    const lines = platforms
      .map((platform) => {
        const key = platform.trim().toLowerCase();
        const guidance = PLATFORM_FORMAT_GUIDANCE[key];

        if (!guidance) {
          return null;
        }

        return `- ${platform}: ${guidance}`;
      })
      .filter((line): line is string => line !== null);

    if (lines.length === 0) {
      return '';
    }

    return `Recommended formats by platform:
${lines.join('\n')}`;
  }
}
