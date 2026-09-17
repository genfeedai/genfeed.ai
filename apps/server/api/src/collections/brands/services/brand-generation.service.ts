import { randomUUID } from 'node:crypto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import {
  FASTLANE_FORMATS,
  type GenerateFastlaneIdeasDto,
} from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import { BrandVoiceGenerationException } from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import {
  BrandVoiceValidationError,
  buildBrandProfileAnalysisPrompt,
  parseGeneratedBrandProfile,
} from '@api/collections/brands/utils/brand-profile-generation.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LinkCategory } from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import {
  BrandVoiceFailureCode,
  type FastlaneFormat,
  type FastlaneIdea,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

    const contextText = await this.resolveBrandContext(
      dto,
      organizationId,
      findBrand,
    );

    const prompt = buildBrandProfileAnalysisPrompt(
      `${contextText}${this.buildSupplementalContext(dto)}`,
    );

    const completion = await this.llmDispatcherService.chatCompletion(
      {
        // The profile contract (12 fields + 6 prompt seeds) truncates at 1200,
        // leaving unparseable JSON.
        max_tokens: 2400,
        messages: [{ content: prompt, role: 'user' }],
        model: LLM_DEFAULTS.planning,
        temperature: 0.7,
      },
      organizationId,
    );

    return this.validateBrandVoiceCompletion(
      completion.choices?.[0]?.message?.content?.trim() ?? '',
      dto.brandId,
      organizationId,
    );
  }

  /**
   * Resolves the brand evidence the prompt is grounded in: a live scrape when
   * the caller supplied a URL, otherwise the stored brand, scraped too when it
   * has a usable website and always keeping its stored identity as grounding.
   * Fails with a classified cause when neither source is usable.
   */
  private async resolveBrandContext(
    dto: GenerateBrandVoiceDto,
    organizationId: string,
    findBrand: BrandFinder,
  ): Promise<string> {
    let contextText = '';

    if (dto.url) {
      const validation = this.brandScraperService.validateUrl(dto.url);
      if (!validation.isValid) {
        this.failBrandVoice({
          brandId: dto.brandId,
          code: BrandVoiceFailureCode.SOURCE_URL_INVALID,
          organizationId,
          ...(validation.error === undefined
            ? {}
            : { detail: validation.error }),
        });
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
      const brand = await findBrand(
        scopedWhere(organizationId, { id: dto.brandId }),
      );
      if (!brand) {
        this.failBrandVoice({
          brandId: dto.brandId,
          code: BrandVoiceFailureCode.BRAND_NOT_FOUND,
          organizationId,
        });
      }

      // Prefer a live website scrape when we can resolve a URL (client may pass
      // `url`; otherwise try websiteUrl alias or a website link on the brand).
      const brandWithLinks = brand as BrandDocument & {
        links?: Array<{ category?: string; url?: string }>;
        website?: string;
        websiteUrl?: string;
      };
      const websiteFromLinks = brandWithLinks.links?.find(
        (link) =>
          link.category === LinkCategory.WEBSITE ||
          link.category === LinkCategory.OTHER,
      )?.url;
      const websiteUrl = (
        (typeof brandWithLinks.websiteUrl === 'string' &&
          brandWithLinks.websiteUrl) ||
        (typeof brandWithLinks.website === 'string' &&
          brandWithLinks.website) ||
        websiteFromLinks ||
        ''
      ).trim();
      if (websiteUrl) {
        const validation = this.brandScraperService.validateUrl(websiteUrl);
        if (validation.isValid) {
          try {
            const scraped =
              await this.brandScraperService.scrapeWebsite(websiteUrl);
            const scrapedParts = [
              scraped.companyName && `Company: ${scraped.companyName}`,
              scraped.description && `Description: ${scraped.description}`,
              scraped.tagline && `Tagline: ${scraped.tagline}`,
              scraped.aboutText && `About: ${scraped.aboutText}`,
              scraped.valuePropositions?.length &&
                `Value propositions: ${scraped.valuePropositions.join(', ')}`,
            ].filter(Boolean);
            if (scrapedParts.length > 0) {
              contextText = scrapedParts.join('\n');
            }
          } catch (scrapeError: unknown) {
            this.logger.warn(
              'Brand website scrape failed; falling back to stored brand fields',
              {
                brandId: dto.brandId,
                error: scrapeError,
                service: this.constructorName,
                websiteUrl,
              },
            );
          }
        }
      }

      if (!contextText) {
        const parts = [
          brand.label && `Brand name: ${brand.label}`,
          brand.description && `Description: ${brand.description}`,
          brand.text && `System prompt: ${brand.text}`,
          websiteUrl && `Website: ${websiteUrl}`,
        ].filter(Boolean);
        contextText = parts.join('\n');
      } else {
        // Always keep stored identity as grounding even when scrape succeeds.
        const identityParts = [
          brand.label && `Brand name: ${brand.label}`,
          brand.description && `Stored description: ${brand.description}`,
          brand.text && `System prompt: ${brand.text}`,
        ].filter(Boolean);
        if (identityParts.length > 0) {
          contextText = `${identityParts.join('\n')}\n${contextText}`;
        }
      }
    } else {
      this.failBrandVoice({
        brandId: dto.brandId,
        code: BrandVoiceFailureCode.SOURCE_REQUIRED,
        organizationId,
      });
    }

    return contextText;
  }

  /** The optional steering the caller added to the request, if any. */
  private buildSupplementalContext(dto: GenerateBrandVoiceDto): string {
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

    return `${audienceContext}${industryContext}${offeringContext}${emulateContext}${avoidContext}`;
  }

  /**
   * Validates provider output against the brand-profile contract before it
   * leaves this service. Nothing is persisted here — the client applies the
   * returned profile through `PATCH /brands/:id/agent-config` — so a rejected
   * profile never touches the stored one.
   *
   * Contract violations are provider-output failures, not internal faults:
   * they become a classified 422 with redacted diagnostics (shape only, never
   * the payload). Anything else propagates unchanged so genuine server faults
   * keep their 500 and Sentry capture.
   */
  private validateBrandVoiceCompletion(
    rawContent: string,
    brandId: string | undefined,
    organizationId: string,
  ): GeneratedBrandVoice {
    try {
      return parseGeneratedBrandProfile(rawContent);
    } catch (error: unknown) {
      if (!(error instanceof BrandVoiceValidationError)) {
        throw error;
      }

      this.failBrandVoice({
        brandId,
        code: error.code,
        missingFields: error.missingFields,
        organizationId,
        outputLength: rawContent.length,
      });
    }
  }

  /**
   * Logs one classified failure with the brand and organization it happened
   * for, then throws it. Every generate-voice failure goes through here, so a
   * cause is recorded exactly once, with full context, and the response shape
   * is decided in a single place. `BrandVoiceGenerationExceptionFilter` only
   * serializes what this built.
   */
  private failBrandVoice(input: {
    brandId: string | undefined;
    code: BrandVoiceFailureCode;
    detail?: string;
    missingFields?: string[];
    organizationId: string;
    outputLength?: number;
  }): never {
    const exception = new BrandVoiceGenerationException({
      code: input.code,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
      ...(input.missingFields === undefined
        ? {}
        : { missingFields: input.missingFields }),
      ...(input.outputLength === undefined
        ? {}
        : { outputLength: input.outputLength }),
    });

    this.logger.warn('Brand voice generation failed', {
      ...exception.diagnostics,
      brandId: input.brandId,
      operation: 'generateBrandVoice',
      organizationId: input.organizationId,
      service: this.constructorName,
    });

    throw exception;
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

    const brand = await findBrand(scopedWhere(organizationId, { id: brandId }));
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
        model: LLM_DEFAULTS.planning,
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
