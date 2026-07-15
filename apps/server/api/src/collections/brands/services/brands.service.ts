import type { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import type { CrawlBrandKitDto } from '@api/collections/brands/dto/crawl-brand-kit.dto';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import type { GenerateFastlaneIdeasDto } from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import type { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import {
  type BrandRelocationPreview,
  type BrandRelocationResult,
  BrandRelocationService,
} from '@api/collections/brands/services/brand-relocation.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  FastlaneIdea,
  IBrandKitApplyResult,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitDraft,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export type {
  BrandRelocationMovingResource,
  BrandRelocationPreview,
  BrandRelocationResult,
  BrandRelocationSummary,
} from '@api/collections/brands/services/brand-relocation.service';

@Injectable()
export class BrandsService extends BaseService<
  BrandDocument,
  CreateBrandDto,
  UpdateBrandDto,
  Prisma.BrandWhereInput
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    cacheService: CacheService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly brandRelocationService: BrandRelocationService,
    private readonly brandGenerationService: BrandGenerationService,
    private readonly brandKitAssetsService: BrandKitAssetsService,
    private readonly brandKitDraftService: BrandKitDraftService,
  ) {
    super(prisma, 'brand', logger, undefined, cacheService);
  }

  async create(
    createBrandDto: CreateBrandDto & {
      organization?: unknown;
      organizationId?: string;
      user?: unknown;
      userId?: string;
    },
  ): Promise<BrandDocument> {
    const { organization, organizationId, user, userId, ...brandFields } =
      createBrandDto;
    const resolvedOrganizationId =
      organizationId ??
      (typeof organization === 'string' ? organization : undefined);
    const resolvedUserId =
      userId ?? (typeof user === 'string' ? user : undefined);

    this.logger.debug('Creating brand', {
      label: createBrandDto.label,
      operation: 'create',
      service: this.constructorName,
      slug: createBrandDto.slug,
    });

    const brand = await super.create({
      ...brandFields,
      ...(resolvedOrganizationId
        ? { organizationId: resolvedOrganizationId }
        : {}),
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    } as CreateBrandDto);

    // Invalidate brand list cache so the new brand is immediately visible
    if (resolvedOrganizationId) {
      await this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.BRANDS_LIST(resolvedOrganizationId),
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
      include: {
        organization: {
          select: {
            slug: true,
          },
        },
      },
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

  findOneBySlug(
    params: Record<string, unknown>,
  ): Promise<BrandDocument | null> {
    return super.findOne(params);
  }

  /**
   * Generate a unique slug for a brand, appending a counter if needed.
   * Brand.slug is unique across all brands (not scoped by organization), so
   * this cannot reuse a slug validated only against Organization.slug.
   * Pass `excludeBrandId` when updating an existing brand's slug to avoid
   * treating the brand's own current slug as a collision.
   */
  async generateUniqueSlug(
    label: string,
    excludeBrandId?: string,
  ): Promise<string> {
    const base = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');

    if (base.length < 2) {
      throw new BadRequestException('Label too short to generate a valid slug');
    }

    let candidate = base;
    let counter = 2;

    while (true) {
      const filter: Prisma.BrandWhereInput = {
        isDeleted: false,
        slug: candidate,
      };
      if (excludeBrandId) {
        filter.id = { not: excludeBrandId };
      }
      if (!(await this.delegate.findFirst({ where: filter }))) {
        break;
      }
      candidate = `${base}-${counter}`;
      counter++;
    }

    return candidate;
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

  async crawlWebsiteBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: CrawlBrandKitDto,
  ): Promise<IBrandKitDraft> {
    return this.brandKitDraftService.crawlWebsiteBrandKitDraft(
      brandId,
      organizationId,
      dto,
      (criteria) => this.findOne(criteria),
    );
  }

  async importBrandKitAssets(
    brandId: string,
    organizationId: string,
    userId: string,
    dto: IBrandKitAssetImportRequest,
  ): Promise<IBrandKitAssetImportResponse> {
    return this.brandKitAssetsService.importBrandKitAssets(
      brandId,
      organizationId,
      userId,
      dto,
      (criteria) => this.findOne(criteria),
    );
  }

  async applyBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ApplyBrandKitDto,
  ): Promise<IBrandKitApplyResult> {
    return this.brandKitDraftService.applyBrandKitDraft(
      brandId,
      organizationId,
      dto,
      (criteria) =>
        this.delegate.findFirst({
          where: criteria,
        }) as Promise<BrandDocument | null>,
      (id, updates) => this.patch(id, updates),
    );
  }

  async buildManualBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ManualBrandKitDto,
  ): Promise<IBrandKitDraft> {
    return this.brandKitDraftService.buildManualBrandKitDraft(
      brandId,
      organizationId,
      dto,
      (criteria) =>
        this.delegate.findFirst({
          where: criteria,
        }) as Promise<BrandDocument | null>,
    );
  }

  async generateBrandVoice(
    dto: GenerateBrandVoiceDto,
    organizationId: string,
  ): Promise<GeneratedBrandVoice> {
    return this.brandGenerationService.generateBrandVoice(
      dto,
      organizationId,
      (criteria) => this.findOne(criteria),
    );
  }

  async generateFastlaneIdeas(
    brandId: string,
    dto: GenerateFastlaneIdeasDto,
    organizationId: string,
  ): Promise<FastlaneIdea[]> {
    return this.brandGenerationService.generateFastlaneIdeas(
      brandId,
      dto,
      organizationId,
      (criteria) => this.findOne(criteria),
    );
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

  // ───────────────────────── Brand → organization relocation ─────────────────────────

  async relocateToOrganization(
    brandId: string,
    updateBrandDto: Partial<UpdateBrandDto> & {
      organizationId?: string;
      relocationAck?: string;
    },
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<BrandRelocationResult> {
    return this.brandRelocationService.relocateToOrganization(
      brandId,
      updateBrandDto,
      actingUser,
      (updates) => this.patch(brandId, updates),
    );
  }

  async previewRelocation(
    brandId: string,
    destOrgId: string,
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<BrandRelocationPreview> {
    return this.brandRelocationService.previewRelocation(
      brandId,
      destOrgId,
      actingUser,
    );
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

    const targetBrand = await this.findOne({
      _id: brandId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!targetBrand) {
      throw new NotFoundException('Brand', brandId);
    }

    // Deselect all brands for user, then select the resolved target brand.
    await this.delegate.updateMany({
      where: { isDeleted: false, organizationId, userId },
      data: { isSelected: false },
    });

    await this.delegate.updateMany({
      where: { id: targetBrand.id, organizationId, isDeleted: false },
      data: { isSelected: true },
    });

    // Return the updated brand
    const updatedBrand = await this.findOne({
      id: targetBrand.id,
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
