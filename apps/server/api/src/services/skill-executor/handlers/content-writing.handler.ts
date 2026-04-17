import { GenerateContentDto } from '@api/collections/content-intelligence/dto/generate-content.dto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  ContentDraft,
  SkillExecutionContext,
  SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ContentIntelligencePlatform } from '@genfeedai/enums';
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
  ): Promise<ContentDraft> {
    const topic = typeof params.topic === 'string' ? params.topic : '';
    const platform =
      typeof params.platform === 'string'
        ? params.platform
        : context.platforms[0];

    if (!topic) {
      throw new Error('content-writing requires a topic');
    }

    const generationDto: GenerateContentDto = {
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

    let refinedContent = firstDraft.content;

    try {
      const completion = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 400,
          messages: [
            {
              content: `Rewrite this content in brand voice: ${context.brandVoice}`,
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
              : 'openai/gpt-4o-mini',
          temperature: 0.7,
        },
        context.organizationId,
      );

      const rewritten = completion.choices[0]?.message?.content;
      if (rewritten) {
        refinedContent = rewritten;
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
