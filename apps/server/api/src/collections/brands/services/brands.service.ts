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
import type {
  BrandAgentConfig,
  BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import {
  type BrandRelocationPreview,
  type BrandRelocationResult,
  BrandRelocationService,
} from '@api/collections/brands/services/brand-relocation.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { toBrandKitAssetRelations } from '@api/collections/brands/utils/brand-kit-asset-relations.util';
import {
  isSlugUniqueConstraintError,
  MAX_SLUG_ALLOCATION_ATTEMPTS,
  nextSlugCandidate,
  slugAllocationBase,
} from '@api/collections/shared/slug-allocation.util';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/workflows/utils/cron-schedule.util';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type {
  FastlaneIdea,
  IBrandKitApplyResult,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitDraft,
  IBrandKitResolvedAssets,
  IBrandOsDraftHandoff,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

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

type BrandCreateInput = CreateBrandDto & {
  agentConfig?: UpdateBrandAgentConfigDto & Record<string, unknown>;
  organizationId?: string;
  userId?: string;
};

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
    private readonly brandOsPreviewService: BrandOsPreviewService,
    private readonly defaultRecurringContentService: DefaultRecurringContentService,
    private readonly skillsService: SkillsService,
  ) {
    super(prisma, 'brand', logger, undefined, cacheService);
  }

  async create(createBrandDto: BrandCreateInput): Promise<BrandDocument> {
    const {
      agentConfig: initialAgentConfig,
      organizationId: resolvedOrganizationId,
      userId: resolvedUserId,
      ...brandFields
    } = createBrandDto;

    if (!resolvedOrganizationId?.trim()) {
      throw new BadRequestException('Organization context is required');
    }

    if (initialAgentConfig?.enabledSkills !== undefined) {
      await this.skillsService.assertAccessibleSkillSlugs(
        resolvedOrganizationId,
        initialAgentConfig.enabledSkills,
      );
    }
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
            ...(initialAgentConfig ? { agentConfig: initialAgentConfig } : {}),
            slug: candidate,
            organizationId: resolvedOrganizationId,
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
    await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.BRANDS]);

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

    const brands = (await this.delegate.findMany({
      include: {
        organization: {
          select: {
            slug: true,
          },
        },
      },
      where,
      orderBy: { label: 'asc' },
    })) as BrandDocument[];

    return this.attachBrandKitAssetRelations(brands, organizationId);
  }

  /**
   * Populate the serializer's brand kit asset relations on fetched brand rows.
   *
   * `brandSerializerConfig` declares `logo`, `banner` and `references` as asset
   * relations, but the Brand table has no such columns — they are `Asset` rows
   * keyed by `parentBrandId`. Nothing populated them, so `brand.logo` was
   * permanently `undefined` and every reader that asks "does this brand have a
   * logo?" — the setup checklist above all — answered no for a brand that has
   * one. Resolution is batched, so a whole org's brand list costs one query.
   */
  async attachBrandKitAssetRelations(
    brands: BrandDocument[],
    organizationId: string,
  ): Promise<BrandDocument[]> {
    const resolved =
      await this.brandKitAssetsService.resolveBrandKitAssetsForBrands(
        brands.map((brand) => String(brand.id)),
        organizationId,
      );

    for (const brand of brands) {
      const relations = toBrandKitAssetRelations(
        resolved.get(String(brand.id)) ?? { references: [] },
      );

      brand.banner = relations.banner;
      brand.logo = relations.logo;
      brand.references = relations.references;
    }

    return brands;
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

    if (updateBrandDto.agentConfig !== undefined) {
      throw new BadRequestException(
        'Use updateAgentConfig for agent configuration changes',
      );
    }

    return this.patchBrandRow(id, updateBrandDto);
  }

  /**
   * Row-level brand patch without the API-surface agentConfig guard. Internal
   * domain flows that assemble a combined write (brand-kit draft apply) use
   * this so the guard's "use updateAgentConfig" rule keeps applying to
   * external callers only.
   */
  private async patchBrandRow(
    id: string,
    updateBrandDto: Partial<UpdateBrandDto>,
  ): Promise<BrandDocument> {
    const brand = await super.patch(
      id,
      omitUndefinedFields(
        updateBrandDto as Record<string, unknown>,
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

  /**
   * Applies a Brand Kit draft through one tenant-scoped statement.
   *
   * A draft that includes agent configuration is built from a full JSON
   * snapshot. Comparing that exact snapshot on the write prevents the draft
   * from replacing sibling keys saved by another request after the draft was
   * assembled. Scalar-only drafts do not need the JSON predicate.
   */
  private async writeBrandKitDraft(
    brandId: string,
    organizationId: string,
    updateBrandDto: Partial<UpdateBrandDto>,
    expectedAgentConfig: BrandDocument['agentConfig'],
  ): Promise<BrandDocument> {
    const data = omitUndefinedFields(updateBrandDto as Record<string, unknown>);
    const writesAgentConfig = data.agentConfig !== undefined;
    const where: Prisma.BrandWhereInput = scopedWhere(organizationId, {
      ...(writesAgentConfig
        ? {
            agentConfig: {
              equals:
                expectedAgentConfig === null
                  ? Prisma.AnyNull
                  : (expectedAgentConfig as Prisma.InputJsonValue),
            },
          }
        : {}),
      id: brandId,
    });

    // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere forces organizationId and isDeleted:false, the unique brand id bounds the write to one row, and the optional agentConfig equality narrows the CAS further.
    const result = await this.delegate.updateMany({ data, where });

    if (result.count !== 1) {
      if (writesAgentConfig) {
        throw new ConflictException(
          'Brand kit changed while this draft was being applied. Reload the draft and retry.',
        );
      }

      throw new NotFoundException('Brand', brandId);
    }

    const updatedBrand = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    })) as BrandDocument | null;

    if (!updatedBrand) {
      throw new NotFoundException('Brand', brandId);
    }

    await this.invalidateBrandContextCaches(brandId, organizationId);

    return updatedBrand;
  }

  private async invalidateBrandContextCaches(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
    );
    await this.cacheInvalidationService.invalidateByTags([
      CACHE_TAGS.BRANDS,
      SCOPED_CACHE_TAGS.BRAND_CONTEXT(organizationId),
    ]);
    await this.accessBootstrapCacheService.invalidateForOrganization(
      organizationId,
    );
  }

  async updateIdentityForOrganization(
    brandId: string,
    organizationId: string,
    identity: { description: string; label: string; slug: string },
  ): Promise<BrandDocument> {
    const result = await this.delegate.updateMany({
      data: identity,
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (result.count !== 1) {
      throw new NotFoundException('Brand', brandId);
    }

    const updated = await this.delegate.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!updated) {
      throw new NotFoundException('Brand', brandId);
    }

    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
    );
    await this.accessBootstrapCacheService.invalidateForOrganization(
      organizationId,
    );
    await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.BRANDS]);

    return updated as BrandDocument;
  }

  async findCreateByIdentityConfirmationSource(
    organizationId: string,
    userId: string,
    sourceActionId: string,
  ): Promise<BrandDocument | null> {
    return this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        agentConfig: {
          equals: sourceActionId,
          path: ['brandIdentityConfirmation', 'createSourceActionId'],
        },
        userId,
      }),
    }) as Promise<BrandDocument | null>;
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
    agentConfig: BrandAgentConfig | UpdateBrandAgentConfigDto,
    retryCount = 0,
  ): Promise<BrandDocument | null> {
    this.logger.debug('Updating brand agent config', {
      brandId,
      operation: 'updateAgentConfig',
      orgId,
      service: this.constructorName,
    });

    if (agentConfig.enabledSkills !== undefined) {
      await this.skillsService.assertAccessibleSkillSlugs(
        orgId,
        agentConfig.enabledSkills,
      );
    }

    const existing = await this.delegate.findFirst({
      where: scopedWhere(orgId, { id: brandId }),
    });

    if (!existing) {
      return null;
    }

    const storedConfig = (existing as Record<string, unknown>).agentConfig;
    const currentConfig = isMergeableRecord(storedConfig) ? storedConfig : {};
    const updatedConfig = { ...currentConfig };
    const incomingSchedule = isMergeableRecord(agentConfig.schedule)
      ? agentConfig.schedule
      : null;
    const hasScheduleUpdate = Boolean(
      incomingSchedule &&
        ['cronExpression', 'enabled', 'timezone'].some(
          (key) => incomingSchedule[key] !== undefined,
        ),
    );

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

    this.validateMergedAgentSchedule(updatedConfig, hasScheduleUpdate);

    // Scope the WRITE, not just the lookup above, and compare the exact JSON
    // snapshot that was merged. The JSON predicate prevents concurrent config
    // writers from overwriting sibling keys even when both writes happen in
    // the same database timestamp tick.
    const expectedAgentConfig =
      storedConfig === null
        ? Prisma.AnyNull
        : (storedConfig as Prisma.InputJsonValue);
    const result = await this.delegate.updateMany({
      data: {
        agentConfig: updatedConfig as Record<string, unknown>,
      },
      where: scopedWhere(orgId, {
        agentConfig: { equals: expectedAgentConfig },
        id: brandId,
      }),
    });

    if (result.count !== 1) {
      if (retryCount < 2) {
        return this.updateAgentConfig(
          brandId,
          orgId,
          agentConfig,
          retryCount + 1,
        );
      }

      return null;
    }

    const updatedBrand = (await this.delegate.findFirst({
      where: scopedWhere(orgId, { id: brandId }),
    })) as BrandDocument | null;

    if (!updatedBrand) {
      return null;
    }

    // `updateMany` bypasses `BaseService.patch()`, so nothing else busts the
    // caches this write invalidates. `agentConfig` is embedded in the
    // assembled agent brand context (`brand-ctx:{orgId}`), so a stale entry
    // keeps the agent running the previous voice/schedule after the save.
    await this.invalidateBrandContextCaches(brandId, orgId);

    if (hasScheduleUpdate) {
      // The config is already persisted. A scheduler outage must not surface
      // as a failed save: take the documented degraded path, which writes the
      // schedule columns and lets `onModuleInit` reconcile the trigger.
      await this.defaultRecurringContentService.updateScheduleFromAgentConfig(
        orgId,
        brandId,
        updatedConfig,
        { isSchedulerRequired: false },
      );
    }

    return updatedBrand;
  }

  private validateMergedAgentSchedule(
    updatedConfig: Record<string, unknown>,
    hasScheduleUpdate: boolean,
  ): void {
    if (!hasScheduleUpdate) {
      return;
    }

    const mergedSchedule = isMergeableRecord(updatedConfig.schedule)
      ? updatedConfig.schedule
      : null;
    const mergedCron =
      typeof mergedSchedule?.cronExpression === 'string'
        ? mergedSchedule.cronExpression.trim()
        : '';
    const mergedTimezone =
      typeof mergedSchedule?.timezone === 'string'
        ? mergedSchedule.timezone.trim()
        : '';

    if (mergedTimezone && !isSchedulableTimezone(mergedTimezone)) {
      throw new BadRequestException(
        `Invalid timezone "${mergedTimezone}". Use an IANA timezone name, for example "Europe/Berlin".`,
      );
    }

    if (mergedCron) {
      try {
        computeNextRunAtOrThrow(mergedCron, mergedTimezone || 'UTC');
      } catch {
        throw new BadRequestException(
          `Invalid cron expression "${mergedCron}". Use a valid cron schedule, for example "0 9 * * 1-5" for weekdays at 9:00 AM.`,
        );
      }
    }
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
      (id, orgId, updates, expectedAgentConfig) =>
        this.writeBrandKitDraft(id, orgId, updates, expectedAgentConfig),
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

  async claimBrandOsPreview(
    brandId: string,
    organizationId: string,
    previewToken: string,
  ): Promise<IBrandOsDraftHandoff> {
    const brand = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    })) as BrandDocument | null;

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    return this.brandOsPreviewService.claimPreview(
      previewToken,
      organizationId,
      brand,
    );
  }

  async readClaimedBrandOsPreview(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandOsDraftHandoff> {
    const brand = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    })) as BrandDocument | null;

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    return this.brandOsPreviewService.readClaimedPreview(organizationId, brand);
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
      id: brandId,
      organizationId: organizationId,
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
