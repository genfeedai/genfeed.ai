import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  type ContentDraft,
  type SkillExecutionContext,
  type SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  linkedin: 3000,
  tiktok: 2200,
  twitter: 280,
  youtube: 5000,
};

@Injectable()
export class TrendRemixHandler implements SkillHandler {
  constructor(
    private readonly trendsService: TrendsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly loggerService: LoggerService,
  ) {}

  async execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<ContentDraft> {
    const platform =
      typeof params.platform === 'string'
        ? params.platform
        : context.platforms[0];

    const trend = await this.resolveTrend(context, params, platform);

    if (!trend) {
      return {
        confidence: 0.3,
        content: 'No active trends found...',
        metadata: {},
        platforms: context.platforms,
        skillSlug: 'trend-remix',
        type: 'text',
      };
    }

    const hashtags = Array.isArray(trend.metadata?.hashtags)
      ? trend.metadata.hashtags.slice(0, 5).join(' ')
      : '';

    const charLimit = PLATFORM_CHAR_LIMITS[platform ?? ''] ?? 2200;
    const tone =
      typeof params.tone === 'string' ? params.tone : 'engaging and authentic';

    const systemPrompt = [
      `You are a social media content expert specializing in trend-based content creation.`,
      `Brand voice: ${context.brandVoice || 'professional and engaging'}.`,
      `Tone: ${tone}.`,
      `Platform: ${platform ?? 'social media'} (max ${charLimit} characters).`,
      `Your task: create a remix of the given trend that feels native to the platform while matching the brand voice.`,
    ].join(' ');

    const userPrompt = [
      `Create a ${platform ?? 'social media'} post that remixes the following trend:`,
      ``,
      `Trend topic: ${trend.topic}`,
      hashtags ? `Trending hashtags: ${hashtags}` : '',
      ``,
      `Requirements:`,
      `- Stay within ${charLimit} characters`,
      `- Match the brand voice: ${context.brandVoice || 'professional and engaging'}`,
      `- Keep tone: ${tone}`,
      `- Include 2-3 relevant hashtags naturally`,
      `- Make it platform-native and engaging`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await this.llmDispatcherService.chatCompletion(
        {
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model:
            typeof params.model === 'string'
              ? params.model
              : 'openai/gpt-4o-mini',
          temperature: 0.8,
        },
        context.organizationId,
      );

      const content = response.choices[0]?.message?.content;

      if (content) {
        return {
          confidence: 0.78,
          content,
          metadata: {
            trendId: trend.id,
            trendTopic: trend.topic,
          },
          platforms: context.platforms,
          skillSlug: 'trend-remix',
          type: 'text',
        };
      }
    } catch (error: unknown) {
      this.loggerService.warn('trend-remix LLM call failed, using fallback', {
        error,
      });
    }

    const fallbackContent = [
      `${trend.topic} — here's our take:`,
      context.brandVoice
        ? `Brought to you with ${context.brandVoice} energy.`
        : '',
      hashtags,
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      confidence: 0.4,
      content: fallbackContent,
      metadata: {
        trendId: trend.id,
        trendTopic: trend.topic,
      },
      platforms: context.platforms,
      skillSlug: 'trend-remix',
      type: 'text',
    };
  }

  private async resolveTrend(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
    platform: string | undefined,
  ) {
    if (typeof params.trendId === 'string') {
      return this.trendsService.getTrendById(
        params.trendId,
        context.organizationId,
      );
    }

    const response = await this.trendsService.getTrendsWithAccessControl(
      context.organizationId,
      context.brandId,
      platform,
    );

    return response.trends[0] ?? null;
  }
}
