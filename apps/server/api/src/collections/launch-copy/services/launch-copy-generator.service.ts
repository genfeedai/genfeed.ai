import type {
  GenerateLaunchCopyDto,
  LaunchCopyChannel,
} from '@api/collections/launch-copy/dto/generate-launch-copy.dto';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { OpenRouterChatCompletionParams } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { Platform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Channel-conform launch copy. Fields are populated per channel:
 * - Hacker News: `showHnTitle` + `firstComment`
 * - Product Hunt: `taglines` + `makerComment`
 * (Colocated result shape, mirroring `GeneratedContent` in content-generator.service.ts.)
 */
export interface LaunchCopyResult {
  channel: LaunchCopyChannel;
  showHnTitle?: string;
  firstComment?: string;
  taglines?: string[];
  makerComment?: string;
}

interface LaunchCopyPrompt {
  system: string;
  user: string;
}

@Injectable()
export class LaunchCopyGeneratorService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly llmDispatcherService: LlmDispatcherService,
  ) {
    this.defaultModel =
      this.configService.get('XAI_MODEL') || 'x-ai/grok-4-fast';
  }

  /**
   * Generate channel-conform launch copy. Inputs are sanitized before they
   * reach the model (prompt-injection defense), and the model is constrained
   * to a per-channel JSON contract that we parse defensively.
   */
  async generate(
    organizationId: string,
    dto: GenerateLaunchCopyDto,
  ): Promise<LaunchCopyResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const productName = SecurityUtil.sanitizePromptInput(dto.productName, 200);
    const description = SecurityUtil.sanitizePromptInput(dto.description, 2000);
    const link = dto.url
      ? SecurityUtil.sanitizePromptInput(dto.url, 500)
      : undefined;
    const variationsCount = dto.variationsCount ?? 3;

    const prompt = this.buildPrompt(
      dto.channel,
      productName,
      description,
      link,
      variationsCount,
    );

    const params: OpenRouterChatCompletionParams = {
      max_tokens: 1200,
      messages: [
        { content: prompt.system, role: 'system' },
        { content: prompt.user, role: 'user' },
      ],
      model: this.defaultModel,
      temperature: 0.8,
    };

    try {
      const response = await this.llmDispatcherService.chatCompletion(
        params,
        organizationId,
      );
      const raw = response.choices[0]?.message?.content ?? '';
      const result = this.parseResponse(dto.channel, raw);

      this.loggerService.log(`${url} success`, {
        channel: dto.channel,
        organizationId,
      });
      return result;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        channel: dto.channel,
        error: (error as Error)?.message,
      });
      throw error;
    }
  }

  private buildPrompt(
    channel: LaunchCopyChannel,
    productName: string,
    description: string,
    link: string | undefined,
    variationsCount: number,
  ): LaunchCopyPrompt {
    const facts = [
      `Product name: ${productName}`,
      `What it does: ${description}`,
      link ? `URL: ${link}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    if (channel === Platform.HACKER_NEWS) {
      return {
        system: [
          'You write "Show HN" submissions for Hacker News.',
          'The audience is technical, skeptical, and allergic to marketing.',
          'Rules for the title:',
          '- Format exactly: "Show HN: <Name> – <plain, factual description>".',
          '- Maximum 80 characters total.',
          '- No marketing adjectives (revolutionary, amazing, game-changing, powerful).',
          '- No emoji, no exclamation marks, no hype. Be specific and concrete.',
          "Also write a first comment (the maker's opening reply): honestly explain",
          'the motivation, what it does, how it is built, and invite feedback. Plain,',
          'humble, technical. No marketing tone.',
          'Respond with ONLY a JSON object, no prose, no code fences:',
          '{"showHnTitle": string, "firstComment": string}',
        ].join('\n'),
        user: facts,
      };
    }

    // Product Hunt
    return {
      system: [
        'You write Product Hunt launch copy.',
        `Produce ${variationsCount} distinct tagline variants. Each tagline:`,
        '- Maximum 60 characters.',
        '- Benefit-led and punchy; clearly conveys what the product does.',
        '- No trailing period.',
        "Also write a maker's first comment: a short authentic story (why you",
        'built it), what it does, who it is for, and an invitation for feedback.',
        'Friendly and genuine, not salesy.',
        'Respond with ONLY a JSON object, no prose, no code fences:',
        '{"taglines": string[], "makerComment": string}',
      ].join('\n'),
      user: facts,
    };
  }

  private parseResponse(
    channel: LaunchCopyChannel,
    response: string,
  ): LaunchCopyResult {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```\n?/g, '');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
    } catch {
      throw new Error('Launch copy model returned invalid JSON');
    }

    if (channel === Platform.HACKER_NEWS) {
      const showHnTitle =
        typeof parsed.showHnTitle === 'string' ? parsed.showHnTitle : undefined;
      const firstComment =
        typeof parsed.firstComment === 'string'
          ? parsed.firstComment
          : undefined;

      if (!showHnTitle) {
        throw new Error('Launch copy model omitted showHnTitle');
      }

      return { channel, firstComment, showHnTitle };
    }

    const taglines = Array.isArray(parsed.taglines)
      ? parsed.taglines.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const makerComment =
      typeof parsed.makerComment === 'string' ? parsed.makerComment : undefined;

    if (taglines.length === 0) {
      throw new Error('Launch copy model omitted taglines');
    }

    return { channel, makerComment, taglines };
  }
}
