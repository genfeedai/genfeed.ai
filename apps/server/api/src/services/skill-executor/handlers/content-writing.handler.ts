import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  GeneratedContent,
  SkillExecutionContext,
  SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ContentIntelligencePlatform } from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import {
  describePlatformTextLimit,
  getPlatformTextLimit,
  measurePlatformText,
} from '@genfeedai/helpers/content/platform-text-length.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentWritingHandler implements SkillHandler {
  constructor(
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly loggerService: LoggerService,
  ) {}

  async execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<GeneratedContent> {
    const topic = typeof params.topic === 'string' ? params.topic : '';
    const platform =
      typeof params.platform === 'string'
        ? params.platform
        : context.platforms[0];

    if (!topic) {
      throw new Error('content-writing requires a topic');
    }

    const generationDto: GenerateContentDto = {
      brandId: context.brandId,
      platform: this.mapPlatform(platform),
      topic,
      variationsCount:
        typeof params.variationsCount === 'number' ? params.variationsCount : 1,
    };

    const generated = await this.contentGeneratorService.generateContent(
      context.organizationId,
      generationDto,
    );

    const firstDraft = generated[0];
    const targetPlatform = generationDto.platform;

    let refinedContent = firstDraft.content;

    try {
      const completion = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 400,
          messages: [
            {
              content: this.buildRewritePrompt(
                context.brandVoice,
                targetPlatform,
              ),
              role: 'system',
            },
            {
              content: firstDraft.content,
              role: 'user',
            },
          ],
          model:
            typeof params.model === 'string'
              ? params.model
              : LLM_DEFAULTS.fastText,
          temperature: 0.7,
        },
        context.organizationId,
      );

      const rewritten = completion.choices[0]?.message?.content?.trim();
      if (
        rewritten &&
        !this.breaksLimitTheDraftMet(
          rewritten,
          firstDraft.content,
          targetPlatform,
        )
      ) {
        refinedContent = rewritten;
      } else if (rewritten) {
        this.loggerService.warn(
          'content-writing rewrite exceeded the platform limit, using base draft',
          { platform: targetPlatform },
        );
      }
    } catch (error: unknown) {
      this.loggerService.warn(
        'content-writing refinement failed, using base draft',
        {
          error,
        },
      );
    }

    return {
      confidence: 0.82,
      content: refinedContent,
      metadata: {
        hashtags: firstDraft.hashtags,
        patternId: firstDraft.patternId,
        patternUsed: firstDraft.patternUsed,
      },
      platforms: context.platforms,
      skillSlug: 'content-writing',
      type: 'text',
    };
  }

  /**
   * The rewrite writes for the target channel: its length as the channel
   * counts it, and the hook in the first line, so autopilot drafts fit before
   * they reach fan-out.
   */
  private buildRewritePrompt(brandVoice: string, platform: string): string {
    const lengthRule = describePlatformTextLimit(platform);
    return [
      brandVoice
        ? `Rewrite this content in brand voice: ${brandVoice}.`
        : 'Rewrite this content in the brand voice.',
      `Write it as one ${platform} post${lengthRule ? ` of ${lengthRule}` : ''}.`,
      'Open with a strong hook in the first line.',
      'Return only the post text.',
    ].join(' ');
  }

  /** A rewrite never replaces a draft that fit with one that does not. */
  private breaksLimitTheDraftMet(
    rewritten: string,
    draft: string,
    platform: string,
  ): boolean {
    const maxLength = getPlatformTextLimit(platform);
    return (
      maxLength !== undefined &&
      measurePlatformText(rewritten, platform) > maxLength &&
      measurePlatformText(draft, platform) <= maxLength
    );
  }

  private mapPlatform(platform: string): ContentIntelligencePlatform {
    const safePlatform = platform.toLowerCase();

    if (
      safePlatform === ContentIntelligencePlatform.TWITTER ||
      safePlatform === ContentIntelligencePlatform.LINKEDIN ||
      safePlatform === ContentIntelligencePlatform.INSTAGRAM ||
      safePlatform === ContentIntelligencePlatform.TIKTOK
    ) {
      return safePlatform;
    }

    return ContentIntelligencePlatform.INSTAGRAM;
  }
}
