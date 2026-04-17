import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentPlanItemDocument } from '@api/collections/content-plan-items/schemas/content-plan-item.schema';
import {
  ContentPlanItemsService,
  type CreateContentPlanItemInput,
} from '@api/collections/content-plan-items/services/content-plan-items.service';
import { GenerateContentPlanDto } from '@api/collections/content-plans/dto/generate-content-plan.dto';
import { ContentPlanDocument } from '@api/collections/content-plans/schemas/content-plan.schema';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentPlanItemType, ContentPlanStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

interface LlmPlanItem {
  topic: string;
  type: 'skill' | 'media_pipeline';
  prompt: string;
  platforms: string[];
  scheduledAt?: string;
  skillSlug?: string;
  pipelineSteps?: Array<{
    type: string;
    model: string;
    prompt?: string;
    aspectRatio?: string;
  }>;
}

interface LlmPlanResponse {
  name: string;
  items: LlmPlanItem[];
}

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
  ) {}

  async generatePlan(
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateContentPlanDto,
  ): Promise<{ plan: ContentPlanDocument; items: ContentPlanItemDocument[] }> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!brand) {
      throw new BadRequestException('Brand not found');
    }

    const agentConfig = brand.agentConfig;
    const voice = agentConfig?.voice;
    const strategy = agentConfig?.strategy;

    const systemPrompt = this.buildSystemPrompt(voice, strategy);
    const userPrompt = this.buildUserPrompt(dto, strategy);

    const response = await this.llmDispatcherService.chatCompletion(
      {
        messages: [
          { content: systemPrompt, role: 'system' },
          { content: userPrompt, role: 'user' },
        ],
        model: 'anthropic/claude-sonnet-4-20250514',
        temperature: 0.7,
      },
      organizationId,
    );

    const content = response.choices?.[0]?.message?.content ?? '';

    const parsed = this.parseLlmResponse(content, dto);

    const plan = await this.contentPlansService.createInternal({
      brand: brandId,
      createdBy: userId,
      description: `AI-generated plan: ${parsed.name}`,
      isDeleted: false,
      itemCount: parsed.items.length,
      name: dto.name ?? parsed.name,
      organization: organizationId,
      periodEnd: new Date(dto.periodEnd),
      periodStart: new Date(dto.periodStart),
      status: ContentPlanStatus.DRAFT,
    });

    const planId = String(plan._id);

    const itemInputs: CreateContentPlanItemInput[] = parsed.items.map(
      (item) => ({
        brand: brandId,
        organization: organizationId,
        pipelineSteps: item.pipelineSteps,
        plan: planId,
        platforms: item.platforms,
        prompt: item.prompt,
        scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : undefined,
        skillSlug: item.skillSlug,
        topic: item.topic,
        type:
          item.type === 'skill'
            ? ContentPlanItemType.SKILL
            : ContentPlanItemType.MEDIA_PIPELINE,
      }),
    );

    const items = await this.contentPlanItemsService.createMany(itemInputs);

    this.logger.log(
      `${this.constructorName}: Generated plan with ${items.length} items`,
      {
        brandId,
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

    return `You are a content strategist AI. Generate a structured content plan as JSON.

${voiceSection}
${strategySection}

Respond with ONLY valid JSON in this format:
{
  "name": "Plan name",
  "items": [
    {
      "topic": "Topic description",
      "type": "skill" or "media_pipeline",
      "prompt": "Detailed content prompt",
      "platforms": ["platform1", "platform2"],
      "scheduledAt": "ISO date string (optional)",
      "skillSlug": "content-writing or image-generation or trend-discovery (if type=skill)",
      "pipelineSteps": [{"type": "text-to-image", "model": "fal-ai/flux-pro/v1.1", "prompt": "...", "aspectRatio": "1:1"}]
    }
  ]
}

For "skill" type items, use skillSlug. For "media_pipeline" items, provide pipelineSteps.
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

    return `Generate a content plan with ${itemCount} items for the period ${dto.periodStart} to ${dto.periodEnd}.
${topics}
${platforms}
${platformGuidance}
${extra}
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

  private parseLlmResponse(
    content: string,
    dto: GenerateContentPlanDto,
  ): LlmPlanResponse {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as LlmPlanResponse;

      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid plan structure: missing items array');
      }

      return {
        items: parsed.items.map((item) => ({
          ...item,
          platforms: item.platforms ?? dto.platforms ?? [],
          topic: item.topic ?? 'Untitled topic',
          type: item.type === 'media_pipeline' ? 'media_pipeline' : 'skill',
        })),
        name: parsed.name ?? `Content Plan ${dto.periodStart}`,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse LLM response';
      this.logger.error(`${this.constructorName}: ${message}`);

      return {
        items: this.generateFallbackItems(dto),
        name: dto.name ?? `Content Plan ${dto.periodStart}`,
      };
    }
  }

  private generateFallbackItems(dto: GenerateContentPlanDto): LlmPlanItem[] {
    const count = dto.itemCount ?? 7;
    const platforms = dto.platforms ?? ['instagram'];
    const items: LlmPlanItem[] = [];

    for (let i = 0; i < count; i++) {
      items.push({
        platforms,
        prompt: `Create engaging content about ${dto.topics?.[i % (dto.topics?.length ?? 1)] ?? 'trending topics'}`,
        skillSlug: 'content-writing',
        topic:
          dto.topics?.[i % (dto.topics?.length ?? 1)] ??
          `Content item ${i + 1}`,
        type: 'skill',
      });
    }

    return items;
  }
}
