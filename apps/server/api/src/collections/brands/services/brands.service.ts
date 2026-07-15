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
  BrandAgentStrategy,
  BrandAgentVoice,
  BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
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
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { FileInputType, FontFamily } from '@genfeedai/enums';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromManualInput,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import type {
  BrandKitAssetRole,
  BrandKitFieldKey,
  FastlaneIdea,
  IBrandKitApplyResult,
  IBrandKitAssetImportCandidate,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitAssetImportResult,
  IBrandKitDiagnostic,
  IBrandKitDraft,
  IExtractedSocialLinks,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

export type {
  BrandRelocationMovingResource,
  BrandRelocationPreview,
  BrandRelocationResult,
  BrandRelocationSummary,
} from '@api/collections/brands/services/brand-relocation.service';

const BRAND_KIT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

const BRAND_KIT_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const BRAND_KIT_ALLOWED_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

const PRISMA_ASSET_CATEGORY_BY_ROLE: Record<
  BrandKitAssetRole,
  Prisma.AssetCreateInput['category']
> = {
  banner: 'BANNER' as Prisma.AssetCreateInput['category'],
  logo: 'LOGO' as Prisma.AssetCreateInput['category'],
  reference: 'REFERENCE' as Prisma.AssetCreateInput['category'],
};

const ASSET_UPLOAD_TYPE_BY_ROLE: Record<BrandKitAssetRole, string> = {
  banner: 'banners',
  logo: 'logos',
  reference: 'references',
};

const BRAND_KIT_SCALAR_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  backgroundColor: 'backgroundColor',
  description: 'description',
  fontFamily: 'fontFamily',
  label: 'label',
  primaryColor: 'primaryColor',
  promptGuidelines: 'text',
  secondaryColor: 'secondaryColor',
};

const BRAND_KIT_VOICE_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  voiceAudience: 'audience',
  voiceDoNotSoundLike: 'doNotSoundLike',
  voiceMessagingPillars: 'messagingPillars',
  voiceSampleOutput: 'sampleOutput',
  voiceStyle: 'style',
  voiceTone: 'tone',
  voiceValues: 'values',
};

const BRAND_KIT_STRATEGY_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  strategyContentTypes: 'contentTypes',
  strategyFrequency: 'frequency',
  strategyGoals: 'goals',
  strategyPlatforms: 'platforms',
};

const BRAND_KIT_DEFERRED_APPLY_FIELDS = new Set<BrandKitFieldKey>([
  'banner',
  'logo',
  'references',
  'socialLinks',
]);

const BRAND_KIT_FIELD_KEYS = new Set<BrandKitFieldKey>(
  BRAND_KIT_FIELD_OWNERSHIP.map((field) => field.key),
);

const BRAND_KIT_STRING_LIST_FIELDS = new Set<BrandKitFieldKey>([
  'strategyContentTypes',
  'strategyGoals',
  'strategyPlatforms',
  'voiceAudience',
  'voiceDoNotSoundLike',
  'voiceMessagingPillars',
  'voiceValues',
]);

const SUPPORTED_FONT_FAMILIES = new Set<string>(Object.values(FontFamily));

@Injectable()
export class BrandsService extends BaseService<
  BrandDocument,
  CreateBrandDto,
  UpdateBrandDto,
  Prisma.BrandWhereInput
> {
  private static readonly SUPPORTED_GUIDANCE_EXTENSIONS = new Set([
    '.csv',
    '.json',
    '.md',
    '.markdown',
    '.txt',
  ]);

  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    cacheService: CacheService,
    private readonly brandScraperService: BrandScraperService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly filesClientService: FilesClientService,
    private readonly brandRelocationService: BrandRelocationService,
    private readonly brandGenerationService: BrandGenerationService,
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
    const validation = this.brandScraperService.validateUrl(dto.url);
    if (!validation.isValid) {
      throw new BadRequestException({
        code: 'brand_kit_invalid_website_url',
        detail: validation.error ?? 'Invalid website URL',
        title: 'Bad Request',
      });
    }

    const brand = await this.findOne({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    try {
      const scraped = await this.brandScraperService.scrapeWebsite(dto.url);
      const diagnostics = this.readSocialUrlDiagnostics(dto.socialUrls);
      const enrichedScrape = this.mergeSocialUrlsIntoScrape(
        scraped,
        dto.socialUrls,
      );

      return buildBrandKitDraftFromWebsiteScrape(
        brand as unknown as BrandKitSourceBrand,
        enrichedScrape,
        {
          diagnostics,
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Website crawl failed';

      return buildBrandKitDraftFromBrand(
        brand as unknown as BrandKitSourceBrand,
        {
          diagnostics: [
            {
              code: 'brand_kit_website_crawl_failed',
              message: `Website crawl failed: ${message}`,
              severity: 'error',
            },
          ],
          evidence: [
            {
              excerpt: message,
              label: 'Website crawl failed',
              sourceType: 'website',
              url: dto.url,
            },
          ],
          sourceType: 'website',
        },
      );
    }
  }

  async importBrandKitAssets(
    brandId: string,
    organizationId: string,
    userId: string,
    dto: IBrandKitAssetImportRequest,
  ): Promise<IBrandKitAssetImportResponse> {
    const brand = await this.findOne({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    if (dto.assets.length === 0) {
      const diagnostic = this.createBrandKitImportDiagnostic(
        'brand_kit_asset_import_empty',
        'At least one asset candidate is required.',
        'error',
      );

      return {
        brandId,
        diagnostics: [diagnostic],
        failedCandidateIds: [],
        importedAssetIds: [],
        results: [],
        skippedCandidateIds: [],
        status: 'blocked',
      };
    }

    const results: IBrandKitAssetImportResult[] = [];
    for (const candidate of dto.assets) {
      results.push(
        await this.importBrandKitAssetCandidate(
          candidate,
          brandId,
          organizationId,
          userId,
        ),
      );
    }

    const importedAssetIds = results
      .filter((result) => result.status === 'imported' && result.assetId)
      .map((result) => String(result.assetId));
    const skippedCandidateIds = results
      .filter((result) => result.status === 'skipped' && result.candidateId)
      .map((result) => String(result.candidateId));
    const failedCandidateIds = results
      .filter((result) => result.status === 'failed' && result.candidateId)
      .map((result) => String(result.candidateId));
    const diagnostics = results.flatMap((result) => result.diagnostics);

    if (importedAssetIds.length > 0) {
      await this.invalidateBrandAssetCaches(brandId, organizationId);
    }

    return {
      brandId,
      diagnostics,
      failedCandidateIds,
      importedAssetIds,
      results,
      skippedCandidateIds,
      status:
        importedAssetIds.length === results.length
          ? 'accepted'
          : importedAssetIds.length > 0
            ? 'partial'
            : 'blocked',
    };
  }

  private async importBrandKitAssetCandidate(
    candidate: IBrandKitAssetImportCandidate,
    brandId: string,
    organizationId: string,
    userId: string,
  ): Promise<IBrandKitAssetImportResult> {
    const candidateId = candidate.candidateId;
    const validation = this.validateBrandKitAssetCandidate(candidate);

    if (validation.diagnostics.length > 0) {
      return {
        candidateId,
        diagnostics: validation.diagnostics,
        role: candidate.role,
        status: 'failed',
      };
    }

    const sourceUrl = validation.url.href;
    const category = PRISMA_ASSET_CATEGORY_BY_ROLE[candidate.role];
    const existing = await this.prisma.asset.findFirst({
      where: {
        category,
        isDeleted: false,
        origin: sourceUrl,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
    });

    if (existing) {
      return {
        assetId: existing.id,
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_already_imported',
            `${candidate.role} candidate was already imported.`,
            'info',
          ),
        ],
        role: candidate.role,
        status: 'skipped',
        url: this.buildImportedAssetUrl(existing.id, candidate.role),
      };
    }

    const hasExistingPrimary =
      candidate.role !== 'reference'
        ? await this.hasExistingBrandAsset(
            brandId,
            organizationId,
            candidate.role,
          )
        : false;

    if (hasExistingPrimary && !candidate.replaceExisting) {
      return {
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_existing_preserved',
            `Existing brand ${candidate.role} was preserved. Set replaceExisting to import this candidate.`,
            'warning',
          ),
        ],
        role: candidate.role,
        status: 'skipped',
      };
    }

    const asset = await this.prisma.asset.create({
      data: {
        category,
        displayName: candidate.label,
        mimeType: validation.mimeType,
        origin: sourceUrl,
        originalFileName: this.readFileName(validation.url),
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
        residency: 'cloud',
        uploadPolicy: 'brand_kit_import',
        userId,
      } satisfies Prisma.AssetUncheckedCreateInput,
    });

    try {
      const uploadMeta = await this.filesClientService.uploadToS3(
        asset.id,
        ASSET_UPLOAD_TYPE_BY_ROLE[candidate.role],
        {
          type: FileInputType.URL,
          url: sourceUrl,
        },
      );

      if (
        typeof uploadMeta.size === 'number' &&
        uploadMeta.size > BRAND_KIT_IMPORT_MAX_BYTES
      ) {
        await this.markImportedAssetDeleted(asset.id);
        return {
          candidateId,
          diagnostics: [
            this.createBrandKitImportDiagnostic(
              'brand_kit_asset_too_large',
              `Imported asset exceeds the ${BRAND_KIT_IMPORT_MAX_BYTES / (1024 * 1024)}MB brand kit limit.`,
              'error',
            ),
          ],
          role: candidate.role,
          status: 'failed',
        };
      }

      const publicUrl =
        typeof uploadMeta.publicUrl === 'string'
          ? uploadMeta.publicUrl
          : this.buildImportedAssetUrl(asset.id, candidate.role);

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          cloudObjectKey: `ingredients/${ASSET_UPLOAD_TYPE_BY_ROLE[candidate.role]}/${asset.id}`,
          mimeType: validation.mimeType,
          sizeBytes:
            typeof uploadMeta.size === 'number' ? uploadMeta.size : undefined,
        },
      });

      if (candidate.replaceExisting) {
        await this.softDeleteReplacedBrandAssets(
          brandId,
          organizationId,
          candidate.role,
          asset.id,
        );
      }

      return {
        assetId: asset.id,
        candidateId,
        diagnostics: [],
        role: candidate.role,
        status: 'imported',
        url: publicUrl,
      };
    } catch (error: unknown) {
      await this.markImportedAssetDeleted(asset.id);
      const message =
        error instanceof Error ? error.message : 'Remote asset import failed';
      return {
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_import_failed',
            message,
            'error',
          ),
        ],
        role: candidate.role,
        status: 'failed',
      };
    }
  }

  private validateBrandKitAssetCandidate(
    candidate: IBrandKitAssetImportCandidate,
  ): {
    diagnostics: IBrandKitDiagnostic[];
    mimeType?: string;
    url: URL;
  } {
    const diagnostics: IBrandKitDiagnostic[] = [];
    const rawUrl = candidate.url ?? candidate.sourceUrl;
    let parsedUrl: URL | undefined;

    if (!rawUrl) {
      diagnostics.push(
        this.createBrandKitImportDiagnostic(
          'brand_kit_asset_missing_url',
          'Asset candidate requires a URL.',
          'error',
        ),
      );
    } else {
      try {
        parsedUrl = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          diagnostics.push(
            this.createBrandKitImportDiagnostic(
              'brand_kit_asset_invalid_protocol',
              'Asset candidate URL must use http or https.',
              'error',
            ),
          );
        } else {
          assertUrlNotPrivate(parsedUrl.href);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Invalid asset candidate URL';
        diagnostics.push(
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_invalid_url',
            message,
            'error',
          ),
        );
      }
    }

    const normalizedMimeType = candidate.mimeType?.trim().toLowerCase();
    if (
      normalizedMimeType &&
      !BRAND_KIT_ALLOWED_MIME_TYPES.has(normalizedMimeType)
    ) {
      diagnostics.push(
        this.createBrandKitImportDiagnostic(
          'brand_kit_asset_unsupported_content_type',
          `${normalizedMimeType} is not supported for brand kit assets.`,
          'error',
        ),
      );
    }

    if (!normalizedMimeType && parsedUrl) {
      const extension = this.readExtension(parsedUrl);
      if (!BRAND_KIT_ALLOWED_EXTENSIONS.has(extension)) {
        diagnostics.push(
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_unknown_content_type',
            'Asset candidate must include a supported image MIME type or file extension.',
            'error',
          ),
        );
      }
    }

    return {
      diagnostics,
      mimeType: normalizedMimeType,
      url: parsedUrl ?? new URL('https://invalid.example'),
    };
  }

  private async hasExistingBrandAsset(
    brandId: string,
    organizationId: string,
    role: Exclude<BrandKitAssetRole, 'reference'>,
  ): Promise<boolean> {
    const existing = await this.prisma.asset.findFirst({
      select: { id: true },
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE[role],
        isDeleted: false,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
    });

    return Boolean(existing);
  }

  private async softDeleteReplacedBrandAssets(
    brandId: string,
    organizationId: string,
    role: BrandKitAssetRole,
    keepAssetId: string,
  ): Promise<void> {
    await this.prisma.asset.updateMany({
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE[role],
        id: { not: keepAssetId },
        isDeleted: false,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
      data: { isDeleted: true },
    });
  }

  private async markImportedAssetDeleted(assetId: string): Promise<void> {
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { isDeleted: true },
    });
  }

  private async invalidateBrandAssetCaches(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(organizationId),
      `brand:${brandId}`,
    );
    await this.cacheInvalidationService.invalidateByTags([
      CACHE_TAGS.BRANDS,
      'assets',
      'links',
      'public',
    ]);
  }

  private createBrandKitImportDiagnostic(
    code: string,
    message: string,
    severity: IBrandKitDiagnostic['severity'],
  ): IBrandKitDiagnostic {
    return { code, message, severity };
  }

  private buildImportedAssetUrl(
    assetId: string,
    role: BrandKitAssetRole,
  ): string {
    return `/ingredients/${ASSET_UPLOAD_TYPE_BY_ROLE[role]}/${assetId}`;
  }

  private readExtension(url: URL): string {
    const pathname = url.pathname.toLowerCase();
    const extensionStart = pathname.lastIndexOf('.');
    return extensionStart >= 0 ? pathname.slice(extensionStart) : '';
  }

  private readFileName(url: URL): string | undefined {
    const filename = url.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename).slice(0, 180) : undefined;
  }

  async applyBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ApplyBrandKitDto,
  ): Promise<IBrandKitApplyResult> {
    const brand = await this.delegate.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const diagnostics: IBrandKitDiagnostic[] = [];
    const appliedFields: BrandKitFieldKey[] = [];
    const preservedFields: BrandKitFieldKey[] = [];
    const updateData: Record<string, unknown> = {};
    const voiceUpdates: Record<string, unknown> = {};
    const strategyUpdates: Record<string, unknown> = {};

    for (const [rawKey, decision] of Object.entries(dto.fields ?? {})) {
      if (!this.isBrandKitFieldKey(rawKey)) {
        diagnostics.push({
          code: 'brand_kit_apply_unknown_field',
          message: `${rawKey} is not a supported brand kit field.`,
          severity: 'warning',
        });
        continue;
      }

      if (decision.action === 'preserve' || decision.action === 'reject') {
        preservedFields.push(rawKey);
        continue;
      }

      if (BRAND_KIT_DEFERRED_APPLY_FIELDS.has(rawKey)) {
        preservedFields.push(rawKey);
        diagnostics.push({
          code: 'brand_kit_apply_deferred_field',
          fieldKey: rawKey,
          message:
            'This field was preserved because safe link and asset import is handled by the dedicated Brand Kit asset child issue.',
          severity: 'warning',
        });
        continue;
      }

      const value = this.coerceBrandKitApplyValue(rawKey, decision.value);

      if (value === undefined) {
        diagnostics.push({
          code: 'brand_kit_apply_invalid_value',
          fieldKey: rawKey,
          message: `${rawKey} did not include a supported value.`,
          severity: 'error',
        });
        continue;
      }

      const scalarField = BRAND_KIT_SCALAR_FIELDS[rawKey];
      const voiceField = BRAND_KIT_VOICE_FIELDS[rawKey];
      const strategyField = BRAND_KIT_STRATEGY_FIELDS[rawKey];

      if (scalarField) {
        updateData[scalarField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      if (voiceField) {
        voiceUpdates[voiceField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      if (strategyField) {
        strategyUpdates[strategyField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      preservedFields.push(rawKey);
      diagnostics.push({
        code: 'brand_kit_apply_unsupported_field',
        fieldKey: rawKey,
        message: `${rawKey} is reviewable but not directly applied yet.`,
        severity: 'warning',
      });
    }

    if (
      Object.keys(voiceUpdates).length > 0 ||
      Object.keys(strategyUpdates).length > 0
    ) {
      updateData.agentConfig = this.mergeBrandKitAgentConfig(
        brand.agentConfig,
        voiceUpdates,
        strategyUpdates,
      );
    }

    if (Object.keys(updateData).length > 0) {
      await this.patch(brandId, updateData as Partial<UpdateBrandDto>);
    }

    const hasBlockingDiagnostic = diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error',
    );

    return {
      appliedFields,
      brandId,
      diagnostics,
      preservedFields,
      status:
        hasBlockingDiagnostic && appliedFields.length === 0
          ? 'blocked'
          : diagnostics.length > 0 || preservedFields.length > 0
            ? 'partial'
            : 'accepted',
    };
  }

  private isBrandKitFieldKey(value: string): value is BrandKitFieldKey {
    return BRAND_KIT_FIELD_KEYS.has(value as BrandKitFieldKey);
  }

  private coerceBrandKitApplyValue(
    key: BrandKitFieldKey,
    value: unknown,
  ): string | string[] | undefined {
    if (key === 'fontFamily') {
      return this.coerceBrandKitFontFamily(value);
    }

    if (BRAND_KIT_STRING_LIST_FIELDS.has(key)) {
      return this.coerceBrandKitStringList(value);
    }

    return this.coerceBrandKitString(value);
  }

  private coerceBrandKitString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private coerceBrandKitFontFamily(value: unknown): string | undefined {
    const normalized = this.coerceBrandKitString(value)
      ?.toLowerCase()
      .replaceAll('_', '-');

    if (!normalized) {
      return undefined;
    }

    return SUPPORTED_FONT_FAMILIES.has(normalized) ? normalized : undefined;
  }

  private coerceBrandKitStringList(value: unknown): string[] | undefined {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\n,]+/)
        : [];

    const normalized = values
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(
        (item, index, all) => item.length > 0 && all.indexOf(item) === index,
      );

    return normalized.length > 0 ? normalized : undefined;
  }

  private toBrandKitRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private mergeBrandKitAgentConfig(
    currentAgentConfig: unknown,
    voiceUpdates: Record<string, unknown>,
    strategyUpdates: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const currentConfig = this.toBrandKitRecord(currentAgentConfig);
    const nextConfig: Record<string, unknown> = { ...currentConfig };

    if (Object.keys(voiceUpdates).length > 0) {
      nextConfig.voice = {
        ...this.toBrandKitRecord(currentConfig.voice),
        ...(voiceUpdates as Partial<BrandAgentVoice>),
      };
    }

    if (Object.keys(strategyUpdates).length > 0) {
      nextConfig.strategy = {
        ...this.toBrandKitRecord(currentConfig.strategy),
        ...(strategyUpdates as Partial<BrandAgentStrategy>),
      };
    }

    return nextConfig as Prisma.InputJsonValue;
  }

  async buildManualBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ManualBrandKitDto,
  ): Promise<IBrandKitDraft> {
    this.validateManualGuidanceDocument(dto.guidanceDocumentName);

    if (!this.hasManualBrandKitInput(dto)) {
      throw new BadRequestException({
        code: 'brand_kit_manual_input_required',
        detail:
          'Provide at least one manual brand field, guidance text, or assigned asset.',
        title: 'Bad Request',
      });
    }

    const brand = await this.delegate.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    return buildBrandKitDraftFromManualInput(
      brand as unknown as BrandKitSourceBrand,
      dto,
    );
  }

  private validateManualGuidanceDocument(
    guidanceDocumentName: string | undefined,
  ): void {
    if (!guidanceDocumentName) {
      return;
    }

    const lower = guidanceDocumentName.toLowerCase();
    const isSupported = [...BrandsService.SUPPORTED_GUIDANCE_EXTENSIONS].some(
      (extension) => lower.endsWith(extension),
    );

    if (!isSupported) {
      throw new BadRequestException({
        code: 'brand_kit_unsupported_guidance_document',
        detail:
          'Upload a text-like guidance file: .txt, .md, .markdown, .json, or .csv.',
        title: 'Bad Request',
      });
    }
  }

  private hasManualBrandKitInput(dto: ManualBrandKitDto): boolean {
    const stringValues = [
      dto.label,
      dto.description,
      dto.primaryColor,
      dto.secondaryColor,
      dto.backgroundColor,
      dto.fontFamily,
      dto.guidanceText,
      dto.voiceTone,
      dto.voiceStyle,
      dto.voiceSampleOutput,
      dto.strategyFrequency,
    ];
    const arrayValues = [
      dto.voiceAudience,
      dto.voiceValues,
      dto.voiceMessagingPillars,
      dto.voiceDoNotSoundLike,
      dto.strategyContentTypes,
      dto.strategyPlatforms,
      dto.strategyGoals,
      dto.assets,
    ];

    return (
      stringValues.some(
        (value) => value !== undefined && value.trim() !== '',
      ) || arrayValues.some((value) => Array.isArray(value) && value.length > 0)
    );
  }

  private mergeSocialUrlsIntoScrape(
    scraped: IScrapedBrandData,
    socialUrls: string[] | undefined,
  ): IScrapedBrandData {
    if (!socialUrls?.length) {
      return scraped;
    }

    const socialLinks: IExtractedSocialLinks = {
      ...(scraped.socialLinks ?? {}),
    };

    for (const url of socialUrls) {
      const validation = this.brandScraperService.validateUrl(url);
      if (!validation.isValid) {
        continue;
      }

      const platform = this.detectSocialPlatform(url);
      if (platform) {
        socialLinks[platform] = url;
      }
    }

    return {
      ...scraped,
      socialLinks,
    };
  }

  private readSocialUrlDiagnostics(
    socialUrls: string[] | undefined,
  ): IBrandKitDraft['diagnostics'] {
    if (!socialUrls?.length) {
      return [];
    }

    return socialUrls.flatMap((url) => {
      const validation = this.brandScraperService.validateUrl(url);
      if (!validation.isValid) {
        return [
          {
            code: 'brand_kit_invalid_social_url',
            message: `${url} was skipped: ${validation.error ?? 'invalid URL'}.`,
            severity: 'warning' as const,
          },
        ];
      }

      return [];
    });
  }

  private detectSocialPlatform(
    url: string,
  ): keyof IExtractedSocialLinks | undefined {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      try {
        hostname = new URL(`https://${url}`).hostname.toLowerCase();
      } catch {
        return undefined;
      }
    }

    // Match the registrable host, not a substring, so look-alike domains like
    // `linkedin.com.evil.test` or `examplex.com` are not misclassified.
    const isHost = (domain: string): boolean =>
      hostname === domain || hostname.endsWith(`.${domain}`);

    if (isHost('instagram.com')) {
      return 'instagram';
    }
    if (isHost('linkedin.com')) {
      return 'linkedin';
    }
    if (isHost('tiktok.com')) {
      return 'tiktok';
    }
    if (isHost('twitter.com') || isHost('x.com')) {
      return 'twitter';
    }
    if (isHost('youtube.com') || isHost('youtu.be')) {
      return 'youtube';
    }
    if (isHost('facebook.com')) {
      return 'facebook';
    }
    return undefined;
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
