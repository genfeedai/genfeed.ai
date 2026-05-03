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

type RemixPackVariantDefinition = {
  angle: string;
  content: string;
  format: string;
  hypothesis: string;
  platform: string;
  type: string;
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
            remixPackVariants: this.buildRemixPackVariants(
              trend.topic,
              platform,
              content,
              params,
            ),
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
        remixPackVariants: this.buildRemixPackVariants(
          trend.topic,
          platform,
          fallbackContent,
          params,
        ),
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

  private buildRemixPackVariants(
    trendTopic: string,
    platform: string | undefined,
    primaryContent: string,
    params: Record<string, unknown>,
  ): RemixPackVariantDefinition[] {
    const targetPlatform = platform ?? 'social';
    const angle =
      typeof params.angle === 'string' && params.angle.trim().length > 0
        ? params.angle.trim()
        : `Brand-fit take on ${trendTopic}`;
    const hypothesis =
      typeof params.hypothesis === 'string' &&
      params.hypothesis.trim().length > 0
        ? params.hypothesis.trim()
        : `${trendTopic} can convert when reframed as a concrete operator takeaway.`;

    return [
      {
        angle,
        content: primaryContent,
        format: 'post-thread',
        hypothesis,
        platform: targetPlatform,
        type: 'text',
      },
      {
        angle: `Visual proof point for ${trendTopic}`,
        content: `Create a social image creative that visualizes: ${angle}`,
        format: 'social-image-creative',
        hypothesis:
          'A visual proof point will make the trend easier to understand and share.',
        platform: targetPlatform,
        type: 'image',
      },
      {
        angle: `Short-form hook for ${trendTopic}`,
        content: `Script a 20-30 second short-form video opening with the strongest hook from: ${primaryContent}`,
        format: 'short-form-video-script',
        hypothesis:
          'A fast hook plus one concrete example will outperform a generic trend recap.',
        platform: targetPlatform,
        type: 'video-script',
      },
      {
        angle: `Long-form analysis of ${trendTopic}`,
        content: `Outline an article or newsletter angle that expands this trend into a practical playbook: ${angle}`,
        format: 'article-newsletter-angle',
        hypothesis:
          'A deeper breakdown will capture users who want implementation detail.',
        platform: 'newsletter',
        type: 'article',
      },
      {
        angle: `Follow-up reply for ${trendTopic}`,
        content: `Draft a reply or follow-up derivative that invites discussion around: ${primaryContent}`,
        format: 'follow-up-reply',
        hypothesis:
          'A reply derivative will extend the original idea into a conversation loop.',
        platform: targetPlatform,
        type: 'reply',
      },
    ];
  }
}
