import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandsService extends BaseService<
  BrandDocument,
  CreateBrandDto,
  UpdateBrandDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    cacheService: CacheService,
    private readonly brandScraperService: BrandScraperService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(prisma, 'brand', logger, undefined, cacheService);
  }

  async create(
    createBrandDto: CreateBrandDto & {
      organization?: unknown;
      organizationId?: string;
    },
  ): Promise<BrandDocument> {
    this.logger.debug('Creating brand', {
      label: createBrandDto.label,
      operation: 'create',
      service: this.constructorName,
      slug: createBrandDto.slug,
    });

    const orgId =
      (createBrandDto.organizationId as string) ??
      (createBrandDto.organization as string);

    const brand = await super.create(createBrandDto);

    // Invalidate brand list cache so the new brand is immediately visible
    if (orgId) {
      await this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.BRANDS_LIST(orgId),
      );
    }
    // Also bust the shared brands tag (covers user-scoped list keys from @Cache decorator)
    await this.cacheInvalidationService.invalidatePattern(
      `${CACHE_TAGS.BRANDS}:*`,
    );

    return brand;
  }

  async findForOrganization(
    organizationId: string,
    options: {
      brandIds?: string[];
    } = {},
  ): Promise<BrandDocument[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

    if (options.brandIds && options.brandIds.length > 0) {
      where.id = { in: options.brandIds };
    }

    return this.delegate.findMany({
      where,
      orderBy: { label: 'asc' },
    }) as Promise<BrandDocument[]>;
  }

  async patch(
    id: string,
    updateBrandDto: Partial<UpdateBrandDto>,
  ): Promise<BrandDocument> {
    this.logger.debug('Updating brand', {
      brandId: id,
      operation: 'patch',
      service: this.constructorName,
    });

    const brand = await super.patch(id, updateBrandDto);

    if (!brand) {
      throw new NotFoundException('Brand', id);
    }

    // Invalidate single-brand cache key; list is busted by BaseService.patch()
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(id),
    );

    return brand;
  }

  async updateAgentConfig(
    brandId: string,
    orgId: string,
    agentConfig: UpdateBrandAgentConfigDto,
  ): Promise<BrandDocument | null> {
    this.logger.debug('Updating brand agent config', {
      brandId,
      operation: 'updateAgentConfig',
      orgId,
      service: this.constructorName,
    });

    const existing = await this.delegate.findFirst({
      where: { id: brandId, isDeleted: false, organizationId: orgId },
    });

    if (!existing) {
      return null;
    }

    const currentConfig =
      ((existing as Record<string, unknown>).agentConfig as Record<
        string,
        unknown
      >) ?? {};
    const updatedConfig = { ...currentConfig };

    for (const [key, value] of Object.entries(agentConfig)) {
      if (value !== undefined) {
        updatedConfig[key] = value;
      }
    }

    return this.delegate.update({
      where: { id: brandId },
      data: {
        agentConfig: updatedConfig as Record<string, unknown>,
      },
    }) as Promise<BrandDocument>;
  }

  /**
   * Generate brand voice configuration from a URL or existing brand data using
   * BrandScraperService for web scraping and LlmDispatcherService for AI analysis.
   */
  async generateBrandVoice(
    dto: GenerateBrandVoiceDto,
    organizationId: string,
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
      const brand = await this.findOne({
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

    const prompt = `Analyze the following brand information and generate a brand voice profile.
Return a JSON object with these exact fields:
- tone: a single descriptive word or short phrase (e.g., "confident", "warm and approachable")
- style: a single descriptive word or short phrase (e.g., "direct", "storytelling")
- audience: an array of 2-4 target audience segments (e.g., ["founders", "developers", "marketers"])
- values: an array of 3-5 core brand values (e.g., ["innovation", "transparency", "quality"])
- taglines: an array of 0-3 short tagline-style phrases
- hashtags: an array of 0-5 brand-safe hashtags
- messagingPillars: an array of 3-5 recurring messaging pillars
- doNotSoundLike: an array of 2-5 tones, phrases, or styles to avoid
- sampleOutput: a short sample post or paragraph that demonstrates the voice

Brand information:
${contextText}${audienceContext}${industryContext}${offeringContext}${emulateContext}${avoidContext}

Respond ONLY with the JSON object, no markdown fences or extra text.`;

    const completion = await this.llmDispatcherService.chatCompletion(
      {
        max_tokens: 500,
        messages: [{ content: prompt, role: 'user' }],
        model: 'anthropic/claude-sonnet-4-5-20250514',
        temperature: 0.7,
      },
      organizationId,
    );

    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? '';

    try {
      const parsed = JSON.parse(rawContent) as GeneratedBrandVoice;
      return {
        audience: Array.isArray(parsed.audience) ? parsed.audience : [],
        doNotSoundLike: Array.isArray(parsed.doNotSoundLike)
          ? parsed.doNotSoundLike
          : [],
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        messagingPillars: Array.isArray(parsed.messagingPillars)
          ? parsed.messagingPillars
          : [],
        sampleOutput:
          typeof parsed.sampleOutput === 'string' ? parsed.sampleOutput : '',
        style: parsed.style || 'direct',
        taglines: Array.isArray(parsed.taglines) ? parsed.taglines : [],
        tone: parsed.tone || 'professional',
        values: Array.isArray(parsed.values) ? parsed.values : [],
      };
    } catch {
      this.logger.warn('Failed to parse brand voice LLM response', {
        rawContent,
        service: this.constructorName,
      });
      return {
        audience: [],
        doNotSoundLike: [],
        hashtags: [],
        messagingPillars: [],
        sampleOutput: '',
        style: 'direct',
        taglines: [],
        tone: 'professional',
        values: [],
      };
    }
  }

  async remove(id: string): Promise<BrandDocument> {
    this.logger.debug('Soft deleting brand', {
      brandId: id,
      operation: 'remove',
      service: this.constructorName,
    });

    const brand = await super.remove(id);

    if (!brand) {
      throw new NotFoundException('Brand', id);
    }

    // Invalidate single-brand cache key; list is busted by BaseService.remove()
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(id),
    );

    return brand;
  }

  /**
   * Count brands matching filter
   */
  count(filter: Record<string, unknown>): Promise<number> {
    return this.delegate.count({ where: filter }) as Promise<number>;
  }

  /**
   * Atomically select a brand for a user by deselecting all others and selecting the target.
   */
  async selectBrandForUser(
    brandId: string,
    userId: string,
    organizationId: string,
  ): Promise<BrandDocument> {
    this.logger.debug('Atomically selecting brand for user', {
      brandId,
      operation: 'selectBrandForUser',
      organizationId,
      service: this.constructorName,
      userId,
    });

    // Deselect all brands for user, then select the target
    await this.delegate.updateMany({
      where: { isDeleted: false, organizationId, userId },
      data: { isSelected: false },
    });

    await this.delegate.updateMany({
      where: { id: brandId, organizationId, isDeleted: false },
      data: { isSelected: true },
    });

    // Return the updated brand
    const updatedBrand = await this.findOne({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!updatedBrand) {
      throw new NotFoundException('Brand', brandId);
    }

    return updatedBrand;
  }

  async clearBrandSelectionForUser(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    this.logger.debug('Clearing selected brand for user', {
      operation: 'clearBrandSelectionForUser',
      organizationId,
      service: this.constructorName,
      userId,
    });

    await this.delegate.updateMany({
      where: { isDeleted: false, organizationId, userId },
      data: { isSelected: false },
    });
  }
}
