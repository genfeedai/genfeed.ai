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
  isSlugUniqueConstraintError,
  MAX_SLUG_ALLOCATION_ATTEMPTS,
  nextSlugCandidate,
  slugAllocationBase,
} from '@api/collections/shared/slug-allocation.util';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
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
  IBrandKitResolvedAssets,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export type {
  BrandRelocationMovingResource,
  BrandRelocationPreview,
  BrandRelocationResult,
  BrandRelocationSummary,
} from '@api/collections/brands/services/brand-relocation.service';

/**
 * `agentConfig` sub-objects that `updateAgentConfig` merges key-by-key instead
 * of replacing wholesale.
 *
 * These are partial-patch targets: the app's brand cards each own a slice of
 * `voice`/`strategy` and send only their own keys, and fields no UI surfaces at
 * all (`voice.taglines`, `voice.hashtags` — written during brand-kit extraction
 * and read back by `buildBrandContext`) would otherwise be dropped by the first
 * inline field save.
 *
 * `platformOverrides` is deliberately absent. It is an authoritative map, not a
 * patch target: the agent profile card rebuilds it from form state and omits
 * overrides the user cleared, so merging would resurrect deleted overrides.
 */
const MERGEABLE_AGENT_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'autoPublish',
  'prompting',
  'schedule',
  'strategy',
  'voice',
]);

function isMergeableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drops keys whose value is `undefined`.
 *
 * Nest's `plainToInstance` materializes every declared DTO field as an own
 * property holding `undefined` when the request body omitted it. Prisma rejects
 * those keys (`Argument X is missing` / invalid undefined), so write paths must
 * never forward them.
 */
function omitUndefinedFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

/**
 * Copies the defined keys of `incoming` over `current`.
 *
 * `undefined` has to be skipped here for the same reason it is skipped at the
 * top level: `plainToInstance` builds the DTO with `new`, and under this
 * codebase's runtime class-field semantics every declared-but-absent property
 * becomes a real own property holding `undefined`. Spreading the instance
 * directly would therefore write `undefined` over each stored value the caller
 * never mentioned — the exact data loss this merge exists to prevent.
 */
function mergeDefinedKeys(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

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
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly brandRelocationService: BrandRelocationService,
    private readonly brandGenerationService: BrandGenerationService,
    private readonly brandKitAssetsService: BrandKitAssetsService,
    private readonly brandKitDraftService: BrandKitDraftService,
  ) {
    super(prisma, 'brand', logger, undefined, cacheService);
  }

  async create(
    createBrandDto: CreateBrandDto & {
      /** Legacy session/controller alias — never a Brand column. */
      brand?: unknown;
      brandId?: unknown;
      organization?: unknown;
      organizationId?: string;
      user?: unknown;
      userId?: string;
    },
  ): Promise<BrandDocument> {
    // BaseCRUD.enrichCreateDto always stamps session `brand` / `organization` /
    // `user` onto create payloads. Brand has no `brand` column — only
    // organizationId/userId FKs. Strip relation aliases before Prisma create.
    // Map string aliases onto scalar FKs; never forward `user`/`organization` as
    // nested relation inputs (Sentry API-GENFEED-AI-6T).
    const {
      brand: _sessionBrand,
      brandId: _sessionBrandId,
      organization,
      organizationId,
      user,
      userId,
      ...brandFields
    } = createBrandDto;
    const resolvedOrganizationId =
      organizationId ??
      (typeof organization === 'string' ? organization : undefined);
    const resolvedUserId =
      userId ?? (typeof user === 'string' ? user : undefined);
    const sanitizedBrandFields = omitUndefinedFields(
      brandFields as Record<string, unknown>,
    );

    const label =
      typeof createBrandDto.label === 'string' && createBrandDto.label.trim()
        ? createBrandDto.label.trim()
        : 'brand';
    const preferredSlug =
      typeof createBrandDto.slug === 'string' && createBrandDto.slug.trim()
        ? createBrandDto.slug.trim()
        : await this.generateUniqueSlug(label);
    const allocationBase = slugAllocationBase(preferredSlug);

    this.logger.debug('Creating brand', {
      label,
      operation: 'create',
      service: this.constructorName,
      slug: preferredSlug,
    });

    let brand: BrandDocument | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_SLUG_ALLOCATION_ATTEMPTS; attempt++) {
      const candidate =
        attempt === 0
          ? preferredSlug
          : nextSlugCandidate(preferredSlug, attempt);

      try {
        brand = await super.create(
          omitUndefinedFields({
            ...sanitizedBrandFields,
            slug: candidate,
            ...(resolvedOrganizationId
              ? { organizationId: resolvedOrganizationId }
              : {}),
            ...(resolvedUserId ? { userId: resolvedUserId } : {}),
          }) as unknown as CreateBrandDto,
        );
        if (attempt > 0) {
          this.logger.warn('Brand slug race recovered with suffix', {
            attempt,
            operation: 'create',
            service: this.constructorName,
            slug: candidate,
          });
        }
        break;
      } catch (error) {
        lastError = error;
        if (!isSlugUniqueConstraintError(error)) {
          throw error;
        }
        this.logger.warn('Brand slug unique constraint collision; retrying', {
          attempt,
          operation: 'create',
          service: this.constructorName,
          slug: candidate,
        });
      }
    }

    if (!brand) {
      this.logger.error('Brand slug allocation exhausted', {
        attempts: MAX_SLUG_ALLOCATION_ATTEMPTS,
        base: allocationBase,
        operation: 'create',
        service: this.constructorName,
      });
      throw lastError instanceof Error
        ? lastError
        : new BadRequestException(
            'Unable to allocate a unique brand slug after concurrent retries',
          );
    }

    // Invalidate brand list cache so the new brand is immediately visible
    if (resolvedOrganizationId) {
      await this.cacheInvalidationService.invalidate(
        CACHE_PATTERNS.BRANDS_LIST(resolvedOrganizationId),
      );
      // Access bootstrap embeds the full org brand list for the switcher;
      // leave it warm and create/list/switcher stay stale until TTL (~30s).
      await this.accessBootstrapCacheService.invalidateForOrganization(
        resolvedOrganizationId,
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
    const where: Record<string, unknown> = scopedWhere(organizationId, {});

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
    updateBrandDto: Partial<UpdateBrandDto> & {
      /** Legacy session/controller alias — never a Brand column. */
      brand?: unknown;
      brandId?: unknown;
      organization?: unknown;
      organizationId?: string;
      user?: unknown;
      userId?: unknown;
    },
  ): Promise<BrandDocument> {
    this.logger.debug('Updating brand', {
      brandId: id,
      operation: 'patch',
      service: this.constructorName,
    });

    // BaseCRUD.enrichUpdateDto stamps session `brand` / `organization` / `user`
    // onto every PATCH. Brand has no `brand` column — same trap as create.
    // Ownership is not mutable via brand PATCH (`UpdateBrandDto` forbids
    // `user`/`userId`); drop both the session alias and any client-supplied
    // scalar so Prisma never sees `data.user` (Sentry API-GENFEED-AI-6T).
    const {
      brand: _sessionBrand,
      brandId: _sessionBrandId,
      organization: _sessionOrganization,
      user: _sessionUser,
      userId: _sessionUserId,
      ...brandFields
    } = updateBrandDto;

    const brand = await super.patch(
      id,
      omitUndefinedFields(
        brandFields as Record<string, unknown>,
      ) as Partial<UpdateBrandDto>,
    );

    if (!brand) {
      throw new NotFoundException('Brand', id);
    }

    // Invalidate single-brand cache key; list is busted by BaseService.patch()
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(id),
    );

    if (typeof brand.organizationId === 'string' && brand.organizationId) {
      await this.accessBootstrapCacheService.invalidateForOrganization(
        brand.organizationId,
      );
    }

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
   * this cannot reuse a slug validated only against Organization.slug. A
   * soft-deleted brand still reserves its slug at the database constraint.
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
      where: scopedWhere(orgId, { id: brandId }),
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
      if (value === undefined) {
        continue;
      }

      const current = updatedConfig[key];

      if (MERGEABLE_AGENT_CONFIG_KEYS.has(key) && isMergeableRecord(value)) {
        updatedConfig[key] = mergeDefinedKeys(
          isMergeableRecord(current) ? current : {},
          value,
        );
        continue;
      }

      updatedConfig[key] = value;
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

  /**
   * Live logo/banner/reference assets for a brand, with absolute CDN URLs.
   *
   * There is no `brand.logo` — see `BrandKitAssetsService.resolveBrandKitAssets`.
   */
  async resolveBrandKitAssets(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandKitResolvedAssets> {
    return this.brandKitAssetsService.resolveBrandKitAssets(
      brandId,
      organizationId,
    );
  }

  /**
   * Batched logo URLs for a page of brands, keyed by brand id.
   *
   * The single-brand resolver above in a loop is an N+1 — see
   * `BrandKitAssetsService.resolveBrandLogoUrls` for why brand ids arrive
   * grouped by owning organization.
   */
  async resolveBrandLogoUrls(
    brandIdsByOrganization: ReadonlyMap<string, readonly string[]>,
  ): Promise<Map<string, string>> {
    return this.brandKitAssetsService.resolveBrandLogoUrls(
      brandIdsByOrganization,
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

    if (typeof brand.organizationId === 'string' && brand.organizationId) {
      await this.accessBootstrapCacheService.invalidateForOrganization(
        brand.organizationId,
      );
    }

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
      where: scopedWhere(organizationId, { userId }),
      data: { isSelected: false },
    });

    await this.delegate.updateMany({
      where: scopedWhere(organizationId, { id: targetBrand.id }),
      data: { isSelected: true },
    });

    // Return the updated brand
    const updatedBrand = await this.findOne(
      scopedWhere(organizationId, { id: targetBrand.id }),
    );

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
      where: scopedWhere(organizationId, { userId }),
      data: { isSelected: false },
    });
  }
}
