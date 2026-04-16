import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  AggregatePaginateModel,
  AggregatePaginateResult,
} from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, PopulateOptions, Types } from 'mongoose';

@Injectable()
export class BrandsService extends BaseService<
  BrandDocument,
  CreateBrandDto,
  UpdateBrandDto
> {
  private readonly constructorName = this.constructor.name;

  // Context-aware population to prevent over-fetching
  private getPopulationForContext(
    context: 'list' | 'detail' | 'minimal' | 'public' = 'minimal',
  ): (string | PopulateOptions)[] {
    switch (context) {
      case 'list':
        return [{ path: 'logo', select: '_id category' }];
      case 'detail':
        return [
          { path: 'logo', select: '_id category isDeleted' },
          { path: 'banner', select: '_id category isDeleted' },
          { path: 'references', select: '_id category isDeleted' },
          {
            options: { sort: { label: 1 } },
            path: 'links',
            select: 'label category url isDeleted',
          } as PopulateOptions,
          {
            options: { sort: { label: 1 } },
            path: 'credentials',
            select: 'externalId externalHandle platform isConnected',
          } as PopulateOptions,
        ];
      case 'public':
        return [
          { path: 'logo', select: '_id category isDeleted' },
          { path: 'banner', select: '_id category isDeleted' },
          { path: 'references', select: '_id category isDeleted' },
          {
            options: { sort: { label: 1 } },
            path: 'links',
            select: 'label category url isDeleted',
          } as PopulateOptions,
          {
            options: { sort: { label: 1 } },
            path: 'credentials',
            select: 'externalId externalHandle platform isConnected',
          } as PopulateOptions,
        ];
      default:
        return [{ path: 'logo', select: '_id' }];
    }
  }

  // Default populate fields for detail context.
  private readonly populateFields: (string | PopulateOptions)[];

  constructor(
    @InjectModel(Brand.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<BrandDocument>,

    public readonly logger: LoggerService,
    cacheService: CacheService,
    private readonly brandScraperService: BrandScraperService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(model, logger, undefined, cacheService);
    this.populateFields = this.getPopulationForContext('detail');
  }

  async findAll(
    aggregate: PipelineStage[],
    options: AggregationOptions,
  ): Promise<AggregatePaginateResult<BrandDocument>> {
    this.logger.debug('Finding all brands', {
      operation: 'findAll',
      service: this.constructorName,
    });

    return await super.findAll(aggregate, options);
  }

  async create(
    createBrandDto: CreateBrandDto & { organization?: unknown },
  ): Promise<BrandDocument> {
    this.logger.debug('Creating brand', {
      label: createBrandDto.label,
      operation: 'create',
      service: this.constructorName,
      slug: createBrandDto.slug,
    });

    // Note: organization is added by enrichCreateDto in the controller
    const enrichedDto = createBrandDto as CreateBrandDto & {
      organization?: string;
    };

    const brand = await super.create(
      createBrandDto,
      this.getPopulationForContext('minimal') as unknown as PopulateOption[],
    );

    // Invalidate brand list cache so the new brand is immediately visible
    if (enrichedDto.organization) {
      await this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.BRANDS_LIST(enrichedDto.organization),
      );
    }
    // Also bust the shared brands tag (covers user-scoped list keys from @Cache decorator)
    await this.cacheInvalidationService.invalidatePattern(
      `${CACHE_TAGS.BRANDS}:*`,
    );

    return brand;
  }

  // @ts-expect-error - overrides base findOne with additional context parameter
  async findOne(
    params: Record<string, unknown>,
    context: 'list' | 'detail' | 'minimal' | 'public' | 'none' = 'detail',
  ): Promise<BrandDocument | null> {
    this.logger.debug('Finding brand', {
      operation: 'findOne',
      params,
      service: this.constructorName,
    });

    return await super.findOne(
      params,
      context === 'none'
        ? []
        : (this.getPopulationForContext(
            context,
          ) as unknown as PopulateOption[]),
    );
  }

  async findOneBySlug(
    params: Record<string, unknown>,
  ): Promise<BrandDocument | null> {
    this.logger.debug('Finding brand by slug', {
      operation: 'findOneBySlug',
      params,
      service: this.constructorName,
    });

    return await super.findOne(
      params,
      this.getPopulationForContext('public') as unknown as PopulateOption[],
    );
  }

  async findForOrganization(
    organizationId: string,
    options: {
      brandIds?: string[];
    } = {},
  ): Promise<BrandDocument[]> {
    const match: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (options.brandIds && options.brandIds.length > 0) {
      match._id = {
        $in: options.brandIds.map((brandId) => new Types.ObjectId(brandId)),
      };
    }

    return await this.model
      .find(match)
      .sort({ label: 1 })
      .populate(this.getPopulationForContext('list'))
      .exec();
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

    const brand = await super.patch(
      id,
      updateBrandDto,
      this.populateFields as unknown as PopulateOption[],
    );

    if (!brand) {
      throw new NotFoundException('Brand', id);
    }

    // Invalidate single-brand cache key; list is busted by BaseService.patch()
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(id),
    );

    return brand;
  }

  updateAgentConfig(
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

    const setPayload = Object.fromEntries(
      Object.entries(agentConfig).flatMap(([key, value]) => {
        if (value === undefined) {
          return [];
        }
        return [[`agentConfig.${key}`, value]];
      }),
    );

    if (Object.keys(setPayload).length === 0) {
      return this.model.findOne({
        _id: brandId,
        isDeleted: false,
        organization: orgId,
      });
    }

    return this.model.findOneAndUpdate(
      {
        _id: brandId,
        isDeleted: false,
        organization: orgId,
      },
      { $set: setPayload },
      {
        new: true,
      },
    );
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
      const brand = await this.findOne(
        {
          _id: new Types.ObjectId(dto.brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
        'none',
      );
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

  async patchAll(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ modifiedCount: number }> {
    this.logger.debug('Bulk updating brands', {
      operation: 'patchAll',
      service: this.constructorName,
    });

    return await super.patchAll(filter, update);
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
    return this.model.countDocuments(filter as never);
  }

  /**
   * Atomically select a brand for a user by deselecting all others and selecting the target.
   * Uses bulkWrite to prevent race conditions.
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

    // Use bulkWrite for atomic operation - deselect all then select one
    await this.model.bulkWrite([
      {
        updateMany: {
          filter: {
            isDeleted: false,
            organization: organizationId,
            user: userId,
          } as Record<string, unknown>,
          // @ts-expect-error TS2322
          update: { $set: { isSelected: false } },
        },
      },
      {
        updateOne: {
          filter: {
            _id: brandId,
            isDeleted: false,
            organization: organizationId,
          } as Record<string, unknown>,
          // @ts-expect-error TS2322
          update: { $set: { isSelected: true } },
        },
      },
    ]);

    // Return the updated brand
    const updatedBrand = await this.findOne({
      _id: brandId,
      isDeleted: false as unknown,
      organization: organizationId,
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

    await this.model.updateMany(
      {
        isDeleted: false,
        organization: organizationId,
        user: userId,
      } as Record<string, unknown>,
      { $set: { isSelected: false } },
    );
  }
}
