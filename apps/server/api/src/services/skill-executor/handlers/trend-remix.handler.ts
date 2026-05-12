import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
<<<<<<< HEAD
import {
  type ContentDraft,
  type SkillExecutionContext,
  type SkillHandler,
=======
import type {
  ContentDraft,
  SkillExecutionContext,
  SkillHandler,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  linkedin: 3000,
<<<<<<< HEAD
  tiktok: 2200,
  twitter: 280,
  youtube: 5000,
};

const TRUSTED_TREND_REMIX_MODELS = new Set([
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
]);

type RemixPackVariantDefinition = {
  angle: string;
  content: string;
  format: string;
  hypothesis: string;
  platform: string;
  type: string;
=======
  threads: 500,
  tiktok: 2200,
  twitter: 280,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
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
      hashtags ? `Trending hashtags: ${hashtags}` : null,
      ``,
      `Requirements:`,
      `- Stay within ${charLimit} characters`,
      `- Match the brand voice: ${context.brandVoice || 'professional and engaging'}`,
      `- Keep tone: ${tone}`,
      `- Include 2-3 relevant hashtags naturally`,
      `- Make it platform-native and engaging`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    try {
      const response = await this.llmDispatcherService.chatCompletion(
        {
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: this.resolveModel(params.model),
=======
    const trendId =
      typeof params.trendId === 'string' ? params.trendId : undefined;
    const platform =
      typeof params.platform === 'string'
        ? params.platform
        : (context.platforms[0] ?? 'twitter');
    const tone = typeof params.tone === 'string' ? params.tone : 'professional';

    const response = await this.trendsService.getTrendsWithAccessControl(
      context.organizationId,
      context.brandId,
    );

    const trend = trendId
      ? response.trends.find((t) => String(t._id) === trendId)
      : response.trends[0];

    if (!trend) {
      throw new Error('No active trends available for remix');
    }

    const topic = trend.topic;
    const hashtags = Array.isArray(trend.metadata?.hashtags)
      ? trend.metadata.hashtags.slice(0, 5).join(' ')
      : '';
    const charLimit = PLATFORM_CHAR_LIMITS[platform.toLowerCase()] ?? 1000;

    try {
      const completion = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 500,
          messages: [
            {
              content:
                'You are a social media content creator. Write original, on-brand content inspired by a trending topic. Never copy the source — remix it with a fresh angle for the brand.',
              role: 'system',
            },
            {
              content: `Brand voice: ${context.brandVoice || 'engaging and authentic'}\n\nTrending topic: ${topic}\nRelevant hashtags: ${hashtags}\nPlatform: ${platform}\nTone: ${tone}\nCharacter limit: ${charLimit}\n\nWrite an original ${platform} post that taps into this trend. Include 2-3 relevant hashtags.`,
              role: 'user',
            },
          ],
          model:
            typeof params.model === 'string'
              ? params.model
              : 'openai/gpt-4o-mini',
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
          temperature: 0.8,
        },
        context.organizationId,
      );

<<<<<<< HEAD
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
=======
      const remixedContent = completion.choices[0]?.message?.content ?? topic;

      return {
        confidence: 0.78,
        content: remixedContent,
        metadata: {
          platform,
          tone,
          trendId: String(trend._id),
          trendTopic: topic,
          viralityScore: trend.viralityScore,
        },
        platforms: context.platforms,
        skillSlug: 'trend-remix',
        type: 'text',
      };
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
    } catch (error: unknown) {
      this.loggerService.warn('trend-remix LLM call failed, using fallback', {
        error,
      });
<<<<<<< HEAD
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
      const trend = await this.trendsService.getTrendById(
        params.trendId,
        context.organizationId,
      );

      const trendOrganizationId = (
        trend as unknown as { organizationId?: string | null } | null
      )?.organizationId;
      if (
        trend &&
        trendOrganizationId &&
        trendOrganizationId !== context.organizationId
      ) {
        return null;
      }

      return trend;
    }

    const response = await this.trendsService.getTrendsWithAccessControl(
      context.organizationId,
      context.brandId,
      platform,
    );

    return response.trends[0] ?? null;
  }

  private resolveModel(value: unknown): string {
    if (
      typeof value === 'string' &&
      TRUSTED_TREND_REMIX_MODELS.has(value.trim())
    ) {
      return value.trim();
    }

    return 'openai/gpt-4o-mini';
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
=======

      return {
        confidence: 0.4,
        content: `Trending: ${topic}. ${context.brandVoice || 'Share your take on this trend.'}`,
        metadata: {
          fallback: true,
          platform,
          tone,
          trendId: String(trend._id),
          trendTopic: topic,
        },
        platforms: context.platforms,
        skillSlug: 'trend-remix',
        type: 'text',
      };
    }
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
  }
}
