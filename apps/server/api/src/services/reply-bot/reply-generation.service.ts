import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivitySource,
  ModelCategory,
  PromptTemplateKey,
  ReplyLength,
  ReplyTone,
  SystemPromptKey,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface ReplyGenerationOptions {
  tweetContent: string;
  tweetAuthor: string;
  tone: ReplyTone;
  length: ReplyLength;
  context?: string;
  customInstructions?: string;
  organizationId: string;
  userId: string;
}

export interface DmGenerationOptions {
  tweetContent: string;
  tweetAuthor: string;
  replyText: string;
  context?: string;
  customInstructions?: string;
  organizationId: string;
  userId: string;
}

// Fallback templates when AI generation fails
const FALLBACK_REPLY_TEMPLATES: Record<ReplyTone, string[]> = {
  [ReplyTone.PROFESSIONAL]: [
    'Thank you for your insightful comment.',
    'Excellent observation. I appreciate your perspective.',
    'Great point. Thank you for engaging with this content.',
  ],
  [ReplyTone.CASUAL]: [
    'Thanks for chiming in! 🙌',
    'Appreciate you sharing your thoughts!',
    'Good stuff! Thanks for the reply.',
  ],
  [ReplyTone.FRIENDLY]: [
    'Thanks so much for your reply! Really appreciate it. 😊',
    'Love hearing from you! Thanks for engaging.',
    'So glad you stopped by! Thanks for sharing.',
  ],
  [ReplyTone.HUMOROUS]: [
    'Ha! You get it. Thanks for playing along! 😄',
    'This is the energy I needed today. Thanks!',
    'Love the vibe! Thanks for keeping it fun.',
  ],
  [ReplyTone.INFORMATIVE]: [
    "Great question! Here's what I can share...",
    'Thanks for asking. Let me elaborate on that.',
    "Interesting point. Here's some additional context.",
  ],
  [ReplyTone.SUPPORTIVE]: [
    "Really appreciate you sharing this! You've got this. 💪",
    'Thanks for being here. Your support means a lot!',
    'So grateful for your engagement. Keep being awesome!',
  ],
  [ReplyTone.ENGAGING]: [
    'Love this! What are your thoughts on...?',
    'Great point! Have you considered...?',
    "Interesting take! I'd love to hear more about your perspective.",
  ],
};

@Injectable()
export class ReplyGenerationService {
  private readonly constructorName: string = String(this.constructor.name);
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly templatesService: TemplatesService,
  ) {}

  /**
   * Generate an AI-powered reply to a tweet
   */
  async generateReply(options: ReplyGenerationOptions): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    if (!options.userId) {
      throw new Error('Reply generation billing user is required');
    }
    await this.assertCreditsAvailable(options.organizationId);

    try {
      // Build the prompt using the existing template system
      const userPrompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.TWEET_REPLY,
        {
          context: options.context || '',
          customInstructions: options.customInstructions || '',
          length: options.length,
          tagGrok: false,
          tone: options.tone,
          tweetAuthor: options.tweetAuthor,
          tweetContent: options.tweetContent,
        },
        options.organizationId,
      );

      // Build and execute the AI prompt
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_TEXT_MODEL,
        {
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_TWEET_REPLY,
          systemPromptTemplate: SystemPromptKey.TWEET_REPLY,
          temperature: 0.8,
        },
        options.organizationId,
      );

      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );

      const replyText = result.trim();
      await this.settleCredits(
        options.organizationId,
        options.userId,
        input,
        replyText,
        'Reply bot text generation',
      );

      this.loggerService.log(`${url} success`, {
        length: options.length,
        replyLength: replyText.length,
        tone: options.tone,
      });

      return replyText;
    } catch (error: unknown) {
      if (error instanceof InsufficientCreditsException) {
        throw error;
      }

      this.loggerService.error(`${url} failed, using fallback`, error);

      // Return a fallback template reply
      return this.getFallbackReply(options.tone);
    }
  }

  /**
   * Generate an AI-powered DM message
   */
  async generateDm(options: DmGenerationOptions): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    if (!options.userId) {
      throw new Error('DM generation billing user is required');
    }
    await this.assertCreditsAvailable(options.organizationId);

    try {
      // Build a DM-specific prompt
      const dmPrompt = `Generate a friendly direct message to @${
        options.tweetAuthor
      } who replied to a tweet.

Original tweet they replied to:
"${options.tweetContent}"

My public reply to them:
"${options.replyText}"

${options.context ? `Context about me/my brand: ${options.context}` : ''}
${
  options.customInstructions
    ? `Custom instructions: ${options.customInstructions}`
    : ''
}

Write a warm, personalized DM that:
1. Thanks them for engaging
2. Continues the conversation naturally
3. Optionally includes a soft call-to-action (newsletter signup, check out my content, etc.)
4. Sounds human and genuine, not salesy
5. Is under 280 characters

DM text:`;

      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_TEXT_MODEL,
        {
          modelCategory: ModelCategory.TEXT,
          prompt: dmPrompt,
          promptTemplate: PromptTemplateKey.TEXT_TWEET_REPLY,
          systemPromptTemplate: SystemPromptKey.TWEET_REPLY,
          temperature: 0.7,
        },
        options.organizationId,
      );

      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );

      const dmText = result.trim();
      await this.settleCredits(
        options.organizationId,
        options.userId,
        input,
        dmText,
        'Reply bot DM generation',
      );

      this.loggerService.log(`${url} success`, {
        dmLength: dmText.length,
      });

      return dmText;
    } catch (error: unknown) {
      if (error instanceof InsufficientCreditsException) {
        throw error;
      }

      this.loggerService.error(`${url} failed, using fallback`, error);

      // Return a simple fallback DM
      return `Hey @${options.tweetAuthor}! Thanks for engaging with my tweet. Really appreciate it! 🙏`;
    }
  }

  /**
   * Get a fallback reply when AI generation fails
   */
  private getFallbackReply(tone: ReplyTone): string {
    const templates =
      FALLBACK_REPLY_TEMPLATES[tone] ||
      FALLBACK_REPLY_TEMPLATES[ReplyTone.FRIENDLY];
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
  }

  /**
   * Replace variables in a template string
   */
  replaceTemplateVariables(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  private async assertCreditsAvailable(organizationId: string): Promise<void> {
    const model = await this.getDefaultTextModel();
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleCredits(
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
    output: string,
    description: string,
  ): Promise<void> {
    const model = await this.getDefaultTextModel();
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      description,
      ActivitySource.SCRIPT,
      {
        maxOverdraftCredits: ReplyGenerationService.TEXT_MAX_OVERDRAFT_CREDITS,
      },
    );
  }

  private async getDefaultTextModel() {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return model;
  }
}
