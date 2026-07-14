import { randomUUID } from 'node:crypto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import {
  FASTLANE_FORMATS,
  type GenerateFastlaneIdeasDto,
} from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import {
  buildBrandProfileAnalysisPrompt,
  parseGeneratedBrandProfile,
} from '@api/collections/brands/utils/brand-profile-generation.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { FastlaneFormat, FastlaneIdea } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

export type BrandFinder = (
  criteria: Record<string, unknown>,
) => Promise<BrandDocument | null>;

@Injectable()
export class BrandGenerationService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly brandScraperService: BrandScraperService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Generate brand voice configuration from a URL or existing brand data using
   * BrandScraperService for web scraping and LlmDispatcherService for AI analysis.
   */
  async generateBrandVoice(
    dto: GenerateBrandVoiceDto,
    organizationId: string,
    findBrand: BrandFinder,
  ): Promise<GeneratedBrandVoice> {
    this.logger.debug('Generating brand voice', {
      brandId: dto.brandId,
      operation: 'generateBrandVoice',
      service: this.constructorName,
      url: dto.url,
    });

    let contextText = '';

    if (dto.url) {
      const validation = this.brandScraperService.validateUrl(dto.url);
      if (!validation.isValid) {
        throw new BadRequestException(validation.error ?? 'Invalid URL');
      }

      const scraped = await this.brandScraperService.scrapeWebsite(dto.url);
      const parts = [
        scraped.companyName && `Company: ${scraped.companyName}`,
        scraped.description && `Description: ${scraped.description}`,
        scraped.tagline && `Tagline: ${scraped.tagline}`,
        scraped.aboutText && `About: ${scraped.aboutText}`,
        scraped.valuePropositions?.length &&
          `Value propositions: ${scraped.valuePropositions.join(', ')}`,
      ].filter(Boolean);
      contextText = parts.join('\n');
    } else if (dto.brandId) {
      const brand = await findBrand({
        id: dto.brandId,
        isDeleted: false,
        organizationId,
      });
      if (!brand) {
        throw new BadRequestException('Brand not found');
      }
      const parts = [
        brand.label && `Brand name: ${brand.label}`,
        brand.description && `Description: ${brand.description}`,
        brand.text && `System prompt: ${brand.text}`,
      ].filter(Boolean);
      contextText = parts.join('\n');
    } else {
      throw new BadRequestException('Either url or brandId must be provided');
    }

    const audienceContext = dto.targetAudience
      ? `\nTarget audience: ${dto.targetAudience}`
      : '';
    const industryContext = dto.industry ? `\nIndustry: ${dto.industry}` : '';
    const offeringContext = dto.offering
      ? `\nWhat the brand sells or creates: ${dto.offering}`
      : '';
    const emulateContext =
      dto.examplesToEmulate?.length && dto.examplesToEmulate.length > 0
        ? `\nExamples to emulate: ${dto.examplesToEmulate.join(' | ')}`
        : '';
    const avoidContext =
      dto.examplesToAvoid?.length && dto.examplesToAvoid.length > 0
        ? `\nExamples or styles to avoid: ${dto.examplesToAvoid.join(' | ')}`
        : '';

    const prompt = buildBrandProfileAnalysisPrompt(
      `${contextText}${audienceContext}${industryContext}${offeringContext}${emulateContext}${avoidContext}`,
    );

    const completion = await this.llmDispatcherService.chatCompletion(
      {
        max_tokens: 1200,
        messages: [{ content: prompt, role: 'user' }],
        model: 'anthropic/claude-sonnet-4-5-20250514',
        temperature: 0.7,
      },
      organizationId,
    );

    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? '';

    try {
      return parseGeneratedBrandProfile(rawContent);
    } catch (error: unknown) {
      this.logger.warn('Failed to parse brand voice LLM response', {
        error,
        rawContent,
        service: this.constructorName,
      });
      throw new InternalServerErrorException(
        'The generated brand profile was invalid. Please try again.',
      );
    }
  }

  /**
   * Turns structured brand data into a batch of ready-to-produce short-form
   * content ideas distributed across the requested formats. This is the
   * brand-data-driven core of Fastlane — the user never writes a prompt.
   *
   * Org-scoped: the brand is loaded with the caller's organizationId so a brand
   * from another org cannot be targeted. Requires a configured brand voice.
   */
  async generateFastlaneIdeas(
    brandId: string,
    dto: GenerateFastlaneIdeasDto,
    organizationId: string,
    findBrand: BrandFinder,
  ): Promise<FastlaneIdea[]> {
    this.logger.debug('Generating fastlane ideas', {
      brandId,
      count: dto.count,
      formats: dto.formats,
      operation: 'generateFastlaneIdeas',
      service: this.constructorName,
    });

    const brand = await findBrand({
      id: brandId,
      isDeleted: false,
      organizationId,
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const branding = buildPromptBrandingFromBrand(brand);
    if (!branding) {
      throw new BadRequestException('Brand voice not configured');
    }

    const brandParts = [
      brand.label && `Brand name: ${brand.label}`,
      brand.description && `Description: ${brand.description}`,
      branding.tone && `Tone: ${branding.tone}`,
      branding.voice && `Style: ${branding.voice}`,
      branding.audience && `Audience: ${branding.audience}`,
      Array.isArray(branding.values) &&
        branding.values.length > 0 &&
        `Values: ${branding.values.join(', ')}`,
      Array.isArray(branding.messagingPillars) &&
        branding.messagingPillars.length > 0 &&
        `Messaging pillars: ${branding.messagingPillars.join(', ')}`,
      Array.isArray(branding.taglines) &&
        branding.taglines.length > 0 &&
        `Taglines: ${branding.taglines.join(' | ')}`,
      Array.isArray(branding.hashtags) &&
        branding.hashtags.length > 0 &&
        `Hashtags: ${branding.hashtags.join(' ')}`,
      Array.isArray(branding.doNotSoundLike) &&
        branding.doNotSoundLike.length > 0 &&
        `Avoid sounding like: ${branding.doNotSoundLike.join(', ')}`,
      branding.sampleOutput && `Sample voice: ${branding.sampleOutput}`,
    ].filter(Boolean);

    const angleContext = dto.angle ? `\nCreative angle: ${dto.angle}` : '';
    const formatsList = dto.formats.join(', ');

    const prompt = `You are a short-form content strategist. Using ONLY the brand profile below, generate ${dto.count} distinct, ready-to-produce short-form content ideas distributed as evenly as possible across these formats: ${formatsList}.

Format meanings:
- image: a single scroll-stopping still or slideshow frame
- video: a short b-roll or hook-and-demo style clip
- avatar: a UGC-style talking-avatar clip with a spoken script

Return ONLY a JSON array (no markdown fences). Each element must be an object with these exact fields:
- format: one of ${formatsList}
- hook: a short scroll-stopping hook line (max ~12 words)
- caption: a ready-to-publish caption with a clear call to action
- visualPrompt: a vivid visual/scene description to feed an image or video generator
- platformHints: array of 1-3 platforms from ["tiktok","instagram","youtube"] this idea suits
- speechText: ONLY for format "avatar" — the spoken script (2-4 sentences); omit for other formats

Brand profile:
${brandParts.join('\n')}${angleContext}

Respond ONLY with the JSON array.`;

    const completion = await this.llmDispatcherService.chatCompletion(
      {
        max_tokens: 2000,
        messages: [{ content: prompt, role: 'user' }],
        model: 'anthropic/claude-sonnet-4-5-20250514',
        temperature: 0.8,
      },
      organizationId,
    );

    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? '';

    try {
      const parsed = JSON.parse(rawContent) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(
          (item): item is Partial<FastlaneIdea> =>
            Boolean(item) && typeof item === 'object',
        )
        .map((item) => {
          const format: FastlaneFormat = FASTLANE_FORMATS.includes(
            item.format as FastlaneFormat,
          )
            ? (item.format as FastlaneFormat)
            : dto.formats[0];

          return {
            caption: typeof item.caption === 'string' ? item.caption : '',
            format,
            hook: typeof item.hook === 'string' ? item.hook : '',
            id: randomUUID(),
            platformHints: Array.isArray(item.platformHints)
              ? item.platformHints.filter(
                  (platform): platform is string =>
                    typeof platform === 'string',
                )
              : [],
            speechText:
              typeof item.speechText === 'string' ? item.speechText : undefined,
            visualPrompt:
              typeof item.visualPrompt === 'string' ? item.visualPrompt : '',
          } satisfies FastlaneIdea;
        })
        .filter((idea) => idea.hook || idea.caption || idea.visualPrompt);
    } catch {
      this.logger.warn('Failed to parse fastlane ideas LLM response', {
        rawContent,
        service: this.constructorName,
      });
      return [];
    }
  }
}
