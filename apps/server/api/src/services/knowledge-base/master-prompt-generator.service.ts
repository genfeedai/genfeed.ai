import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ActivitySource, KnowledgeBaseCategory } from '@genfeedai/enums';
import type { IExtractedBrandData, IMasterPrompt } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * System prompts for generating brand master prompts
 */
const BRAND_ANALYSIS_SYSTEM_PROMPT = `You are a brand strategist and marketing expert. Analyze the provided brand information and generate a comprehensive brand voice profile.

Your analysis should include:
1. Brand tone (e.g., professional, casual, playful, authoritative)
2. Brand voice characteristics (e.g., friendly, expert, innovative)
3. Target audience profile
4. Core brand values
5. Key messaging themes and taglines
6. Relevant hashtags for social media

Respond in JSON format with the following structure:
{
  "tone": "string describing overall tone",
  "voice": "string describing voice characteristics",
  "audience": "string describing target audience",
  "values": ["array", "of", "brand", "values"],
  "taglines": ["array", "of", "suggested", "taglines"],
  "hashtags": ["array", "of", "hashtags", "without", "hash", "symbol"]
}`;

const MASTER_PROMPT_SYSTEM_PROMPT = `You are an AI content strategist. Based on the brand information provided, generate system prompts that can be used to create content consistent with the brand's voice and values.

Generate 4 master prompts for the following categories:
1. Brand Voice - A system prompt for maintaining consistent brand voice
2. Content Guidelines - Guidelines for content creation
3. Audience Targeting - How to address the target audience
4. Tone & Style - Specific tone and style instructions

Respond in JSON format with an array of prompts:
[
  {
    "category": "brand_voice",
    "title": "Brand Voice System Prompt",
    "prompt": "The full system prompt text...",
    "guidance": "Optional usage guidance"
  }
]`;

/**
 * MasterPromptGeneratorService
 *
 * Uses AI to analyze brand content and generate:
 * - Brand voice analysis (tone, voice, audience, values)
 * - Master prompts for content generation
 */
@Injectable()
export class MasterPromptGeneratorService {
  private readonly constructorName: string = String(this.constructor.name);
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Analyze brand content and generate voice profile
   */
  async analyzeBrandVoice(
    brandData: IExtractedBrandData,
    billingContext?: { organizationId: string; userId: string },
  ): Promise<IExtractedBrandData['brandVoice']> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    try {
      const brandContext = this.buildBrandContext(brandData);

      // Construct prompt for Replicate text model
      const fullPrompt = `${BRAND_ANALYSIS_SYSTEM_PROMPT}\n\nAnalyze this brand and generate a voice profile:\n\n${brandContext}\n\nRespond ONLY with a valid JSON object, no additional text.`;
      const input = {
        max_tokens: 1000,
        prompt: fullPrompt,
        temperature: 0.7,
      };

      await this.assertCreditsAvailable(billingContext);

      const content = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );

      if (!content) {
        throw new Error('No response from Replicate');
      }

      await this.settleCredits(billingContext, input, content);

      // Extract JSON from response (may contain markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonContent = jsonMatch ? jsonMatch[0] : content;
      const analysis = JSON.parse(jsonContent);

      this.loggerService.log(`${caller} completed`, { analysis });

      return {
        audience: analysis.audience || 'General audience',
        hashtags: analysis.hashtags || [],
        taglines: analysis.taglines || [],
        tone: analysis.tone || 'Professional',
        values: analysis.values || [],
        voice: analysis.voice || 'Friendly and informative',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof InsufficientCreditsException) {
        throw error;
      }

      // Return default values on failure
      return {
        audience: 'General audience',
        hashtags: [],
        taglines: [],
        tone: 'Professional',
        values: [],
        voice: 'Friendly and informative',
      };
    }
  }

  /**
   * Generate master prompts for content generation
   */
  async generateMasterPrompts(
    brandData: IExtractedBrandData,
    billingContext?: { organizationId: string; userId: string },
  ): Promise<IMasterPrompt[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    try {
      const brandContext = this.buildBrandContext(brandData);
      const voiceContext = brandData.brandVoice
        ? `\n\nBrand Voice Analysis:\n- Tone: ${brandData.brandVoice.tone}\n- Voice: ${brandData.brandVoice.voice}\n- Audience: ${brandData.brandVoice.audience}\n- Values: ${brandData.brandVoice.values?.join(', ')}`
        : '';

      // Construct prompt for Replicate text model
      const fullPrompt = `${MASTER_PROMPT_SYSTEM_PROMPT}\n\nGenerate master prompts for this brand:\n\n${brandContext}${voiceContext}\n\nRespond ONLY with a valid JSON array or object with a "prompts" key, no additional text.`;
      const input = {
        max_tokens: 2000,
        prompt: fullPrompt,
        temperature: 0.7,
      };

      await this.assertCreditsAvailable(billingContext);

      const content = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );

      if (!content) {
        throw new Error('No response from Replicate');
      }

      await this.settleCredits(billingContext, input, content);

      // Extract JSON from response (may contain markdown code blocks)
      const jsonMatch = content.match(/[[{][\s\S]*[\]}]/);
      const jsonContent = jsonMatch ? jsonMatch[0] : content;
      const parsed = JSON.parse(jsonContent);
      const prompts: IMasterPrompt[] = Array.isArray(parsed)
        ? parsed
        : parsed.prompts || [];

      this.loggerService.log(`${caller} completed`, {
        promptCount: prompts.length,
      });

      return prompts;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof InsufficientCreditsException) {
        throw error;
      }

      // Return default prompts on failure
      return this.getDefaultMasterPrompts(brandData);
    }
  }

  /**
   * Build context string from brand data for AI analysis
   */
  private buildBrandContext(brandData: IExtractedBrandData): string {
    const parts: string[] = [];

    if (brandData.companyName) {
      parts.push(`Company Name: ${brandData.companyName}`);
    }

    if (brandData.tagline) {
      parts.push(`Tagline: ${brandData.tagline}`);
    }

    if (brandData.description) {
      parts.push(`Description: ${brandData.description}`);
    }

    if (brandData.heroText) {
      parts.push(`Hero Text: ${brandData.heroText}`);
    }

    if (brandData.aboutText) {
      parts.push(`About: ${brandData.aboutText}`);
    }

    if (brandData.valuePropositions?.length) {
      parts.push(
        `Value Propositions:\n- ${brandData.valuePropositions.join('\n- ')}`,
      );
    }

    if (brandData.metaDescription) {
      parts.push(`Meta Description: ${brandData.metaDescription}`);
    }

    if (brandData.metaKeywords?.length) {
      parts.push(`Keywords: ${brandData.metaKeywords.join(', ')}`);
    }

    if (brandData.sourceUrl) {
      parts.push(`Website: ${brandData.sourceUrl}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Get default master prompts when AI generation fails
   */
  private getDefaultMasterPrompts(
    brandData: IExtractedBrandData,
  ): IMasterPrompt[] {
    const companyName = brandData.companyName || 'the brand';
    const createdAt = new Date().toISOString();

    const buildPrompt = (
      id: string,
      title: string,
      prompt: string,
      description: string,
    ): IMasterPrompt => ({
      category: KnowledgeBaseCategory.DOCUMENT,
      createdAt,
      description,
      id,
      isActive: true,
      prompt,
      tags: ['default', 'master-prompt'],
      title,
      updatedAt: createdAt,
    });

    return [
      buildPrompt(
        'default-brand-voice',
        'Brand Voice System Prompt',
        `You are creating content for ${companyName}. Maintain a professional yet approachable tone. Focus on delivering value to the audience while staying true to the brand's core message.`,
        'Use this prompt as a system prompt for all content generation.',
      ),
      buildPrompt(
        'default-content-guidelines',
        'Content Creation Guidelines',
        `When creating content for ${companyName}, follow these guidelines:\n1. Keep messaging clear and concise\n2. Focus on benefits over features\n3. Use active voice\n4. Include relevant calls-to-action\n5. Maintain consistent terminology`,
        'Reference when creating any marketing content.',
      ),
      buildPrompt(
        'default-audience-targeting',
        'Audience Targeting Prompt',
        `When addressing ${companyName}'s audience, consider their needs and pain points. Speak to them as knowledgeable peers while making complex topics accessible. Address their goals and how ${companyName} helps achieve them.`,
        'Use to tailor content for the target audience.',
      ),
      buildPrompt(
        'default-tone-style',
        'Tone & Style Guidelines',
        `The tone for ${companyName} content should be:\n- Confident but not arrogant\n- Informative but engaging\n- Professional but personable\n- Clear but not oversimplified`,
        'Reference for maintaining consistent tone.',
      ),
    ];
  }

  private async assertCreditsAvailable(billingContext?: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    if (!billingContext) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        billingContext.organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        billingContext.organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleCredits(
    billingContext: { organizationId: string; userId: string } | undefined,
    input: Record<string, unknown>,
    output: string,
  ): Promise<void> {
    if (!billingContext) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      billingContext.organizationId,
      billingContext.userId,
      amount,
      'Master prompt generation',
      ActivitySource.SCRIPT,
      {
        maxOverdraftCredits:
          MasterPromptGeneratorService.TEXT_MAX_OVERDRAFT_CREDITS,
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
