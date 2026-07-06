import { createHash, randomUUID } from 'node:crypto';
import {
  AUDITOR_IGNORED_TABLES,
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import type { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import type { CrawlBrandKitDto } from '@api/collections/brands/dto/crawl-brand-kit.dto';
import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';
import type {
  GenerateBrandVoiceDto,
  GeneratedBrandVoice,
} from '@api/collections/brands/dto/generate-brand-voice.dto';
import {
  FASTLANE_FORMATS,
  type GenerateFastlaneIdeasDto,
} from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import type { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type {
  BrandAgentStrategy,
  BrandAgentVoice,
  BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  getMetadataRecord,
  getSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  FileInputType,
  FontFamily,
  MemberRole,
  WorkflowStatus,
} from '@genfeedai/enums';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromManualInput,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import type {
  BrandKitAssetRole,
  BrandKitFieldKey,
  FastlaneFormat,
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
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

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

/**
 * Minimal structural view of a Prisma model delegate, used to drive the brand→org
 * relocation cascade generically over the config in `brand-org-cascade.constants`.
 * The concrete `Prisma.TransactionClient` delegates satisfy this shape.
 */
interface CascadeDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<{ id: string }[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

// Prisma error codes used by the relocation transaction's retry/conflict handling.
// P2034 — serialization failure (SQLSTATE 40001) under Serializable isolation: the
//   transaction was aborted by a read/write conflict with a concurrent transaction.
//   Retried up to MAX_RELOCATION_SERIALIZATION_RETRIES times (mirrors
//   default-recurring-content.service.ts's ensureRecurringWorkflowForType).
// P2002 — unique constraint violation: mapped to a 409 ConflictException.
const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const MAX_RELOCATION_SERIALIZATION_RETRIES = 3;

/**
 * Read-only classification of what a brand relocation would touch, shared by the
 * preview endpoint (ack-token computation) and the transactional move itself.
 */
interface RelocationImpact {
  soleBrandWorkflowIds: string[];
  multiBrandWorkflowIds: string[];
  staleMemberIds: string[];
}

/** Describes one shared workflow cloned into the destination org during a move. */
interface RelocationWorkflowClone {
  id: string;
  activate: boolean;
  needsReview: boolean;
  schedule: string | null;
  timezone: string | null;
  isScheduleEnabled: boolean;
  status: string;
}

/** Outcome of reconciling a brand's cross-org workflow/member links during a move. */
interface RelocationReconcileResult {
  workflowsMoved: number;
  clones: RelocationWorkflowClone[];
  membersSevered: number;
}

/** Server-authoritative summary of a completed (or no-op) brand relocation. */
export interface BrandRelocationSummary {
  workflowsMoved: number;
  workflowsClonedActive: number;
  workflowsClonedPaused: number;
  membersSevered: number;
  schedulingPending: number;
}

/** Result of `relocateToOrganization`: the moved brand plus a summary for the client. */
export interface BrandRelocationResult {
  brand: BrandDocument;
  summary: BrandRelocationSummary;
}

/** Counts + ack token returned by the read-only relocation preview endpoint. */
export interface BrandRelocationPreview {
  counts: {
    soleBrandWorkflows: number;
    sharedWorkflows: number;
    staleMembers: number;
  };
  ackToken: string | null;
}

const EMPTY_RELOCATION_SUMMARY: BrandRelocationSummary = {
  workflowsMoved: 0,
  workflowsClonedActive: 0,
  workflowsClonedPaused: 0,
  membersSevered: 0,
  schedulingPending: 0,
};

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
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly filesClientService: FilesClientService,
    private readonly workflowExecutionQueueService: WorkflowExecutionQueueService,
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
  ): Promise<FastlaneIdea[]> {
    this.logger.debug('Generating fastlane ideas', {
      brandId,
      count: dto.count,
      formats: dto.formats,
      operation: 'generateFastlaneIdeas',
      service: this.constructorName,
    });

    const brand = await this.findOne({
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

  private static readonly RELOCATION_ELEVATED_ROLES: ReadonlySet<string> =
    new Set([MemberRole.OWNER, MemberRole.ADMIN]);

  /**
   * Brand scalar columns that may be co-updated during a relocation PATCH. Relation
   * fields (voice/music/user/organization) are intentionally excluded — they need
   * their own handling and would break a raw scalar update.
   */
  private static readonly RELOCATION_PASSTHROUGH_FIELDS: readonly string[] = [
    'label',
    'description',
    'slug',
    'text',
    'fontFamily',
    'primaryColor',
    'secondaryColor',
    'backgroundColor',
    'scope',
    'isActive',
    'isHighlighted',
    'isSelected',
    'isDarkroomEnabled',
    'isDeleted',
    'defaultVideoModel',
    'defaultImageModel',
    'defaultImageToVideoModel',
    'defaultMusicModel',
  ];

  /**
   * Relocate a brand to another organization, cascading the denormalized
   * `organizationId` across every brand-owned record in one transaction. A runtime
   * orphan auditor rolls the whole move back if any dual-keyed table is left stale,
   * so an unhandled/new table fails loudly instead of splitting tenancy.
   *
   * Authorization: platform superadmin, OR an owner/admin of BOTH the source and
   * destination organizations (guarantees the caller keeps access to the brand).
   */
  async relocateToOrganization(
    brandId: string,
    updateBrandDto: Partial<UpdateBrandDto> & {
      organizationId?: string;
      relocationAck?: string;
    },
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<BrandRelocationResult> {
    const destOrgId = updateBrandDto.organizationId;
    if (!destOrgId) {
      throw new BadRequestException(
        'organizationId is required to relocate a brand',
      );
    }

    const brand = (await this.delegate.findFirst({
      where: { id: brandId, isDeleted: false },
    })) as (BrandDocument & { organizationId: string }) | null;
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const sourceOrgId = brand.organizationId;

    // Same org → not a relocation; apply the other fields via the normal patch.
    if (sourceOrgId === destOrgId) {
      const patched = await this.patch(
        brandId,
        this.stripRelocationField(updateBrandDto),
      );
      return { brand: patched, summary: { ...EMPTY_RELOCATION_SUMMARY } };
    }

    const destOrg = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: destOrgId, isDeleted: false },
    });
    if (!destOrg) {
      throw new NotFoundException('Organization', destOrgId);
    }

    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId);

    const passthrough = this.pickRelocationPassthrough(updateBrandDto);
    const relocationAck = updateBrandDto.relocationAck;

    this.logger.log('Relocating brand between organizations', {
      brandId,
      destOrgId,
      operation: 'relocateToOrganization',
      service: this.constructorName,
      sourceOrgId,
    });

    let reconcileResult: RelocationReconcileResult = {
      clones: [],
      membersSevered: 0,
      workflowsMoved: 0,
    };

    for (
      let attempt = 0;
      attempt < MAX_RELOCATION_SERIALIZATION_RETRIES;
      attempt += 1
    ) {
      try {
        reconcileResult = await this.prisma.$transaction(
          async (tx) => {
            await this.assertRelocationAck(
              tx,
              brandId,
              destOrgId,
              relocationAck,
            );
            const result = await this.runBrandOrgCascade(
              tx,
              brandId,
              destOrgId,
              passthrough,
              actingUser,
            );
            await this.assertNoBrandOrgOrphans(tx, brandId, destOrgId);
            return result;
          },
          { isolationLevel: 'Serializable' },
        );
        break;
      } catch (error: unknown) {
        const errorCode = (error as { code?: string }).code;

        if (errorCode === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
          const target = Array.isArray(
            (error as Prisma.PrismaClientKnownRequestError).meta?.target,
          )
            ? (
                (error as Prisma.PrismaClientKnownRequestError).meta
                  ?.target as string[]
              ).join(', ')
            : 'a unique constraint';
          throw new ConflictException(
            `Cannot move brand: a record in the destination organization already conflicts on ${target}.`,
          );
        }

        if (
          errorCode === PRISMA_SERIALIZATION_FAILURE &&
          attempt < MAX_RELOCATION_SERIALIZATION_RETRIES - 1
        ) {
          this.logger.debug(
            `${this.constructorName} serialization failure on brand relocation attempt ${attempt + 1} — retrying`,
            { brandId, destOrgId, sourceOrgId },
          );
          await new Promise<void>((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          );
          continue;
        }

        throw error;
      }
    }

    await this.invalidateRelocationCaches(brandId, sourceOrgId, destOrgId);

    // Post-commit, best-effort scheduler registration for clones that were created
    // active. Failures are captured (not swallowed) into `schedulingPending` — the
    // boot-time `syncAllWorkflowSchedulers` sweep is the idempotent backstop, so a
    // failed registration here never leaves the clone permanently unscheduled.
    let schedulingPending = 0;
    for (const clone of reconcileResult.clones) {
      if (!clone.activate || !clone.schedule) {
        continue;
      }
      try {
        await this.workflowExecutionQueueService.upsertWorkflowScheduler({
          cronExpression: clone.schedule,
          timezone: clone.timezone || 'UTC',
          workflowId: clone.id,
        });
      } catch (error: unknown) {
        schedulingPending += 1;
        this.logger.error(
          `${this.constructorName} failed to register scheduler for cloned workflow ${clone.id}`,
          error,
          'BrandsService',
        );
      }
    }

    const moved = (await this.delegate.findFirst({
      where: { id: brandId },
    })) as BrandDocument | null;
    if (!moved) {
      throw new NotFoundException('Brand', brandId);
    }

    const workflowsClonedActive = reconcileResult.clones.filter(
      (clone) => clone.activate,
    ).length;
    const workflowsClonedPaused =
      reconcileResult.clones.length - workflowsClonedActive;

    return {
      brand: moved,
      summary: {
        membersSevered: reconcileResult.membersSevered,
        schedulingPending,
        workflowsClonedActive,
        workflowsClonedPaused,
        workflowsMoved: reconcileResult.workflowsMoved,
      },
    };
  }

  /**
   * Recompute the SHA-256 ack token over the (sorted) set of workflows that will be
   * cloned into the destination org. Order-independent and stable across preview →
   * move, so a client-supplied token only matches if the impacted set hasn't changed.
   */
  private computeRelocationAckToken(
    multiBrandWorkflowIds: string[],
    brandId: string,
    destOrgId: string,
  ): string {
    const sorted = [...multiBrandWorkflowIds].sort();
    return createHash('sha256')
      .update(`${sorted.join(',')}|${brandId}|${destOrgId}`)
      .digest('hex');
  }

  /**
   * Read-only preview for the consent modal: what a relocation of `brandId` to
   * `destOrgId` would affect, plus the ack token the client must echo back on the
   * PATCH to confirm it saw these counts. Returns `ackToken: null` when there is no
   * clone impact (nothing to confirm).
   */
  async previewRelocation(
    brandId: string,
    destOrgId: string,
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<BrandRelocationPreview> {
    const brand = (await this.delegate.findFirst({
      where: { id: brandId, isDeleted: false },
    })) as (BrandDocument & { organizationId: string }) | null;
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const sourceOrgId = brand.organizationId;

    const destOrg = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: destOrgId, isDeleted: false },
    });
    if (!destOrg) {
      throw new NotFoundException('Organization', destOrgId);
    }

    await this.assertCanRelocate(actingUser, sourceOrgId, destOrgId);

    const impact = await this.classifyRelocationImpact(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
      destOrgId,
    );

    const ackToken =
      impact.multiBrandWorkflowIds.length > 0
        ? this.computeRelocationAckToken(
            impact.multiBrandWorkflowIds,
            brandId,
            destOrgId,
          )
        : null;

    return {
      ackToken,
      counts: {
        sharedWorkflows: impact.multiBrandWorkflowIds.length,
        soleBrandWorkflows: impact.soleBrandWorkflowIds.length,
        staleMembers: impact.staleMemberIds.length,
      },
    };
  }

  /**
   * Server-enforced consent gate: recomputes the impacted set + hash inside the
   * relocation transaction. If cloning would happen and the caller's `relocationAck`
   * doesn't match, reject with 409 — closes both the stale-client/direct-PATCH bypass
   * and the preview→move TOCTOU (impacted set changed ⇒ hash mismatch ⇒ re-preview).
   */
  private async assertRelocationAck(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    relocationAck: string | undefined,
  ): Promise<void> {
    const impact = await this.classifyRelocationImpact(tx, brandId, destOrgId);
    if (impact.multiBrandWorkflowIds.length === 0) {
      return;
    }
    const expected = this.computeRelocationAckToken(
      impact.multiBrandWorkflowIds,
      brandId,
      destOrgId,
    );
    if (relocationAck !== expected) {
      throw new ConflictException(
        'This move will copy shared workflow(s) into the destination organization. ' +
          'Confirmation is required and the previewed impact may be stale — request a ' +
          'fresh relocation preview and try again.',
      );
    }
  }

  /**
   * Read-only classification of the sole-vs-multi-brand workflow split (plus stale
   * members) that a relocation of `brandId` to `destOrgId` would produce. Single
   * source of truth reused by the preview endpoint and the transactional move.
   * A soft-deleted sibling brand still counts as "shared" — the safe direction is to
   * never over-move a workflow that has any other brand association.
   */
  private async classifyRelocationImpact(
    client: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<RelocationImpact> {
    const delegateClient = client as unknown as Record<string, CascadeDelegate>;

    const staleMembers = await delegateClient.member.findMany({
      select: { id: true },
      where: {
        brands: { some: { id: brandId } },
        organizationId: { not: destOrgId },
      },
    });

    // Workflows attached to the moving brand but sitting in a source (non-dest) org.
    // Soft-deleted workflows are excluded — moving/cloning one would resurrect it
    // (the clone is written with `isDeleted: false`), and a dead M2M link is invisible
    // to tenant reads anyway. The M2M backstop below likewise ignores deleted links.
    const crossOrgWorkflows = await delegateClient.workflow.findMany({
      select: { id: true },
      where: {
        brands: { some: { id: brandId } },
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });
    // Of those, the ones ALSO linked to a different (live) brand — anchored to the
    // source org, so they cannot move in place (a soft-deleted sibling brand still
    // counts: treating it as shared is the safe direction).
    const sharedWorkflows = await delegateClient.workflow.findMany({
      select: { id: true },
      where: {
        brands: { some: { id: brandId } },
        AND: [{ brands: { some: { id: { not: brandId } } } }],
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });
    const sharedWorkflowIds = new Set(sharedWorkflows.map((w) => w.id));

    return {
      multiBrandWorkflowIds: crossOrgWorkflows
        .filter((w) => sharedWorkflowIds.has(w.id))
        .map((w) => w.id),
      soleBrandWorkflowIds: crossOrgWorkflows
        .filter((w) => !sharedWorkflowIds.has(w.id))
        .map((w) => w.id),
      staleMemberIds: staleMembers.map((m) => m.id),
    };
  }

  private stripRelocationField<
    T extends { organizationId?: string; relocationAck?: string },
  >(dto: T): Omit<T, 'organizationId' | 'relocationAck'> {
    // Strip BOTH the relocation trigger and its consent token: neither is a Brand
    // column, so leaking them into a normal CRUD patch (e.g. a client retry after the
    // move already committed) would make Prisma reject the update on an unknown field.
    const { organizationId: _omitOrg, relocationAck: _omitAck, ...rest } = dto;
    return rest;
  }

  private pickRelocationPassthrough(
    dto: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of BrandsService.RELOCATION_PASSTHROUGH_FIELDS) {
      if (Object.hasOwn(dto, key) && dto[key] !== undefined) {
        out[key] = dto[key];
      }
    }
    return out;
  }

  private async assertCanRelocate(
    actingUser: { userId: string; isSuperAdmin: boolean },
    sourceOrgId: string,
    destOrgId: string,
  ): Promise<void> {
    if (actingUser.isSuperAdmin) {
      return;
    }
    if (!actingUser.userId) {
      throw new ForbiddenException(
        'You are not allowed to move this brand between organizations.',
      );
    }
    const [sourceElevated, destElevated] = await Promise.all([
      this.hasElevatedMembership(actingUser.userId, sourceOrgId),
      this.hasElevatedMembership(actingUser.userId, destOrgId),
    ]);
    if (!sourceElevated || !destElevated) {
      throw new ForbiddenException(
        'Moving a brand between organizations requires an owner or admin role in both the source and destination organizations.',
      );
    }
  }

  private async hasElevatedMembership(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      select: { role: { select: { key: true } }, roleKey: true },
      where: { isActive: true, isDeleted: false, organizationId, userId },
    });
    if (!member) {
      return false;
    }
    const roleKey = member.roleKey ?? member.role?.key ?? undefined;
    return (
      roleKey !== undefined &&
      BrandsService.RELOCATION_ELEVATED_ROLES.has(roleKey)
    );
  }

  /**
   * Rewrite the denormalized organization id across the brand and everything it owns.
   * Runs entirely inside the caller's transaction.
   */
  private async runBrandOrgCascade(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    passthrough: Record<string, unknown>,
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    // 1. The brand row itself (+ any co-patched scalar fields).
    await client.brand.updateMany({
      data: { ...passthrough, organizationId: destOrgId },
      where: { id: brandId },
    });

    // 2. First-order tables: rewrite the denormalized org key.
    for (const target of FIRST_ORDER_TARGETS) {
      await client[target.delegate].updateMany({
        data: { [target.orgField]: destOrgId },
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
    }

    // 3. Second-order children (no brand key): follow a moved parent by scalar FK.
    for (const child of SECOND_ORDER_TARGETS) {
      const orClauses: Record<string, unknown>[] = [];
      for (const parent of child.parents) {
        const parentRows = await client[parent.parentDelegate].findMany({
          select: { id: true },
          where: { [parent.parentBrandField]: brandId },
        });
        if (parentRows.length > 0) {
          orClauses.push({
            [parent.fkField]: { in: parentRows.map((row) => row.id) },
          });
        }
      }
      if (orClauses.length === 0) {
        continue;
      }
      await client[child.delegate].updateMany({
        data: { [child.orgField]: destOrgId },
        where: { OR: orClauses, [child.orgField]: { not: destOrgId } },
      });
    }

    // 4. Reconcile associations that would become cross-org (clone shared workflows,
    //    move sole-brand workflows, sever stale members).
    return this.reconcileCrossOrgLinks(tx, brandId, destOrgId, actingUser);
  }

  /**
   * Reconcile source-org associations that become cross-org after the move.
   *
   * `Member` and `Workflow` link to a brand through many-to-many join tables, not a
   * scalar brand key, so the generic cascade cannot touch them. They are handled here:
   *
   *   • Members always belong to their own org and never move — their brand link is
   *     severed (and stale `lastUsedBrandId` pointers cleared).
   *   • Workflows are split by ownership. A workflow can drive several brands at once,
   *     so it cannot be blindly re-homed:
   *       – sole-brand  (this brand is its ONLY brand) → MOVED with the brand, together
   *         with its org-keyed execution/batch history, so the relocated brand keeps its
   *         automation intact.
   *       – multi-brand (also drives other brands)     → the moved brand is DISCONNECTED
   *         from the original (which stays in the source org for its other brands), and
   *         a CLONE is created in the destination org, scoped to the moved brand, so the
   *         brand never silently loses its automation. The clone is created ACTIVE only
   *         when the source is effectively active+scheduled and the rewritten config is
   *         "clean" (no lingering cross-org resource references); otherwise it is created
   *         as a DRAFT for the user to review.
   *
   * The acting user keeps access to the brand because relocation requires membership in
   * the destination org.
   */
  private async reconcileCrossOrgLinks(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate> & {
      brand: {
        update(args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }): Promise<unknown>;
      };
    };

    const impact = await this.classifyRelocationImpact(tx, brandId, destOrgId);
    const { multiBrandWorkflowIds: workflowsToClone } = impact;
    const workflowsToMove = impact.soleBrandWorkflowIds;
    const staleMemberIds = impact.staleMemberIds;

    // Disconnect the multi-brand workflows + all stale members from the brand. The
    // original workflow row is untouched otherwise and stays in the source org for its
    // remaining brands.
    if (staleMemberIds.length > 0 || workflowsToClone.length > 0) {
      await client.brand.update({
        data: {
          members: { disconnect: staleMemberIds.map((id) => ({ id })) },
          workflows: {
            disconnect: workflowsToClone.map((id) => ({ id })),
          },
        },
        where: { id: brandId },
      });
    }

    // Clear default-recurring markers on workflows that will NOT move — done BEFORE the
    // move so a marker already parked in the destination org (the partial unique index
    // keys on organizationId, so such a row is technically permitted) is nulled out
    // before a mover could collide with it on
    // (defaultRecurringBrandId, organizationId, contentType). Moved sole-brand workflows
    // are excluded and keep their marker: the brand moves with them, so the (brand, org)
    // default-recurring pairing stays valid in the destination org.
    await client.workflow.updateMany({
      data: { defaultRecurringBrandId: null },
      where: {
        defaultRecurringBrandId: brandId,
        ...(workflowsToMove.length > 0
          ? { id: { notIn: workflowsToMove } }
          : {}),
      },
    });

    // Move sole-brand workflows (definition + org-keyed execution/batch history) into
    // the destination org. The brand M2M link is intentionally kept.
    if (workflowsToMove.length > 0) {
      await client.workflow.updateMany({
        data: { organizationId: destOrgId },
        where: {
          id: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
      await client.workflowExecution.updateMany({
        data: { organizationId: destOrgId },
        where: {
          workflowId: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
      await client.batchWorkflowJob.updateMany({
        data: { organizationId: destOrgId },
        where: {
          workflowId: { in: workflowsToMove },
          organizationId: { not: destOrgId },
        },
      });
    }

    // Clone each multi-brand (shared) workflow into the destination org, scoped to the
    // moved brand, instead of silently severing it.
    const clones: RelocationWorkflowClone[] = [];
    for (const workflowId of workflowsToClone) {
      const clone = await this.cloneWorkflowForRelocation(
        tx,
        workflowId,
        brandId,
        destOrgId,
        actingUser,
      );
      if (clone) {
        clones.push(clone);
      }
    }

    // Clear per-member "last used brand" pointers left in other orgs.
    await client.member.updateMany({
      data: { lastUsedBrandId: null },
      where: { lastUsedBrandId: brandId, organizationId: { not: destOrgId } },
    });

    // Runtime backstop for the many-to-many links the scalar orphan auditor cannot see
    // (`workflow_brands` / `member_brands`). Still inside the transaction, recompute the
    // post-state and roll the whole move back if any cross-org link survived — closing
    // the window where a concurrent `workflow_brands` edit races the sole-vs-shared
    // classification above.
    await this.assertNoCrossOrgBrandLinks(
      client,
      brandId,
      destOrgId,
      workflowsToMove,
    );

    return {
      clones,
      membersSevered: staleMemberIds.length,
      workflowsMoved: workflowsToMove.length,
    };
  }

  /**
   * Clone a shared (multi-brand) workflow into the destination org, scoped only to the
   * moved brand. Uses a typed `tx.workflow.create({ data })` directly — NEVER
   * `WorkflowsService.cloneWorkflow`, which is unsafe cross-org (it does not rewrite
   * brand references or vet the config for cross-org resource leakage).
   */
  private async cloneWorkflowForRelocation(
    tx: Prisma.TransactionClient,
    sourceWorkflowId: string,
    brandId: string,
    destOrgId: string,
    actingUser: { userId: string; isSuperAdmin: boolean },
  ): Promise<RelocationWorkflowClone | null> {
    const source = await tx.workflow.findFirst({
      where: { id: sourceWorkflowId },
    });
    if (!source) {
      return null;
    }

    const rewrittenNodes = this.rewriteBrandReferences(source.nodes, brandId);
    const rewrittenSteps = this.rewriteBrandReferences(source.steps, brandId);
    const rewrittenConfig = this.rewriteBrandReferences(source.config, brandId);
    const rewrittenInputVariables = this.rewriteBrandReferences(
      source.inputVariables,
      brandId,
    );

    const isClean = await this.isRelocationCloneClean(
      tx,
      destOrgId,
      rewrittenNodes,
      rewrittenSteps,
      rewrittenConfig,
      rewrittenInputVariables,
    );
    // A protected system workflow must never be cloned into an active, user-scheduled
    // state: its `systemWorkflowAction` nodes have no executor in the user scheduler, so
    // scheduled runs would only record failures (the normal scheduler skips system
    // workflows by design). Force such clones to paused/DRAFT for manual review.
    const isSystemSource = Boolean(getSystemWorkflowMetadata(source.metadata));
    const sourceEffectivelyActive =
      source.status === WorkflowStatus.ACTIVE &&
      Boolean(source.isScheduleEnabled) &&
      Boolean(source.schedule);
    const activate = sourceEffectivelyActive && isClean && !isSystemSource;

    const cloneOwnerId = await this.resolveRelocationCloneOwner(
      tx,
      source.userId,
      destOrgId,
      actingUser.userId,
    );

    // The clone is a plain user-workflow copy: strip both the system marker and the
    // default-recurring designation. Default-recurring ownership is managed per
    // (brand, org, contentType) by DefaultRecurringContentService — a relocated clone
    // never carries `defaultRecurringBrandId` (the source's marker was already nulled
    // for shared workflows above; preserving it here would be dead code anyway).
    const metadataRecord = getMetadataRecord(source.metadata);
    delete metadataRecord[SYSTEM_WORKFLOW_METADATA_KEY];
    delete metadataRecord.defaultRecurringContent;

    let created: { id: string } | null = null;
    try {
      created = await tx.workflow.create({
        data: {
          brands: { connect: [{ id: brandId }] },
          config: rewrittenConfig as Prisma.InputJsonValue,
          defaultRecurringBrandId: null,
          description: source.description,
          edges: source.edges as Prisma.InputJsonValue,
          executionCount: 0,
          inputVariables: rewrittenInputVariables as Prisma.InputJsonValue,
          isDeleted: false,
          isScheduleEnabled: activate,
          label: source.label,
          lifecycle: source.lifecycle,
          lockedNodeIds: source.lockedNodeIds as Prisma.InputJsonValue,
          metadata: metadataRecord as Prisma.InputJsonValue,
          nodes: rewrittenNodes as Prisma.InputJsonValue,
          organizationId: destOrgId,
          progress: 0,
          recurrence: source.recurrence as Prisma.InputJsonValue,
          schedule: source.schedule,
          status: activate ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
          steps: rewrittenSteps as Prisma.InputJsonValue,
          thumbnail: source.thumbnail,
          thumbnailNodeId: source.thumbnailNodeId,
          timezone: source.timezone,
          userId: cloneOwnerId,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          `Cannot clone workflow "${source.label ?? source.id}" into the destination organization: a conflicting record already exists.`,
        );
      }
      throw error;
    }

    return {
      id: created.id,
      activate,
      isScheduleEnabled: activate,
      needsReview: !activate,
      schedule: source.schedule,
      status: activate ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
      timezone: source.timezone,
    };
  }

  /**
   * Best-effort rewrite of brand-id references inside a workflow's JSON definition,
   * pointing them at the moved brand. Deliberately conservative: any object with a
   * recognizable brand-id field (`brandId`, `brandIds`) is rewritten; everything else is
   * left untouched. Non-object/array input is returned as-is.
   */
  private rewriteBrandReferences(value: unknown, brandId: string): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.rewriteBrandReferences(item, brandId));
    }
    if (value && typeof value === 'object') {
      const record = { ...(value as Record<string, unknown>) };
      for (const key of Object.keys(record)) {
        if (key === 'brandId' && typeof record[key] === 'string') {
          record[key] = brandId;
          continue;
        }
        if (
          key === 'brandIds' &&
          Array.isArray(record[key]) &&
          (record[key] as unknown[]).every((id) => typeof id === 'string')
        ) {
          record[key] = [brandId];
          continue;
        }
        record[key] = this.rewriteBrandReferences(record[key], brandId);
      }
      return record;
    }
    return value;
  }

  /**
   * Conservative cleanliness heuristic for a relocation clone (documented limitation:
   * unknown/custom node shapes fail toward "not clean", never toward an unsafe active
   * clone). Collects every string value under the rewritten JSON that looks like a
   * Prisma cuid (id-like token), then checks whether any of those ids resolve to an
   * org-scoped resource row — `Credential`, `Ingredient`, or `Asset` (whose org column is
   * `parentOrgId`, not `organizationId`) — that belongs to an org OTHER than the
   * destination. If so, the clone is not clean and must be created paused (DRAFT) for
   * manual review. Only owned/known org-scoped tables are checked; anything unresolved is
   * simply ignored (not treated as dirty) since it is not one of the resource kinds this
   * heuristic understands.
   */
  private async isRelocationCloneClean(
    tx: Prisma.TransactionClient,
    destOrgId: string,
    ...rewrittenJson: unknown[]
  ): Promise<boolean> {
    const candidateIds = new Set<string>();
    const CUID_PATTERN = /^[a-z0-9]{20,}$/i;
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) {
          collect(item);
        }
        return;
      }
      if (value && typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) {
          collect(nested);
        }
        return;
      }
      if (typeof value === 'string' && CUID_PATTERN.test(value)) {
        candidateIds.add(value);
      }
    };
    for (const json of rewrittenJson) {
      collect(json);
    }

    if (candidateIds.size === 0) {
      return true;
    }
    const ids = [...candidateIds];

    // Match BOTH the primary cuid and the legacy Mongo alias (`mongoId`) — workflow
    // JSON can carry either form, and a missed legacy id would let a clone referencing a
    // foreign-org resource be marked clean (and scheduled) instead of paused for review.
    const idOr = [{ id: { in: ids } }, { mongoId: { in: ids } }];
    const [foreignCredential, foreignIngredient, foreignAsset] =
      await Promise.all([
        tx.credential.findFirst({
          select: { id: true },
          where: { OR: idOr, organizationId: { not: destOrgId } },
        }),
        tx.ingredient.findFirst({
          select: { id: true },
          where: { OR: idOr, organizationId: { not: destOrgId } },
        }),
        tx.asset.findFirst({
          select: { id: true },
          where: { OR: idOr, parentOrgId: { not: destOrgId } },
        }),
      ]);

    return !foreignCredential && !foreignIngredient && !foreignAsset;
  }

  /**
   * Clone ownership: keep the source workflow's owner if they are still an active
   * member of the destination org (so an unrelated brand-mover doesn't silently become
   * the automation owner); otherwise fall back to the acting user, who is guaranteed to
   * be a member of the destination org (relocation requires it).
   */
  private async resolveRelocationCloneOwner(
    tx: Prisma.TransactionClient,
    sourceUserId: string,
    destOrgId: string,
    actingUserId: string,
  ): Promise<string> {
    const isDestMember = async (userId: string): Promise<boolean> =>
      Boolean(
        await tx.member.findFirst({
          select: { id: true },
          where: {
            isActive: true,
            isDeleted: false,
            organizationId: destOrgId,
            userId,
          },
        }),
      );

    if (await isDestMember(sourceUserId)) {
      return sourceUserId;
    }
    // A superadmin relocation may run with an acting user who is NOT a member of the
    // destination org. Never assign the clone to a non-member (workflow listing is
    // user-scoped, so the org would be unable to see or edit it): prefer the acting
    // user only when they are a real dest member, else fall back to an active dest
    // owner/admin, and only as a last resort to the acting user.
    if (await isDestMember(actingUserId)) {
      return actingUserId;
    }
    const elevated = [...BrandsService.RELOCATION_ELEVATED_ROLES];
    const destAdmin = await tx.member.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: destOrgId,
        OR: [
          { roleKey: { in: elevated } },
          { role: { key: { in: elevated } } },
        ],
      },
    });
    return destAdmin?.userId ?? actingUserId;
  }

  /**
   * Post-sever invariant for brand-linked M2M resources (workflows, members), which the
   * scalar-column orphan auditor is structurally blind to. Throws (rolling back the
   * transaction) if any survived cross-org.
   */
  private async assertNoCrossOrgBrandLinks(
    client: Record<string, CascadeDelegate>,
    brandId: string,
    destOrgId: string,
    movedWorkflowIds: string[],
  ): Promise<void> {
    // Nothing should still be attached to the moved brand from a source org: sole-brand
    // workflows moved into the destination org, every other link was severed.
    // Only LIVE links matter: a soft-deleted workflow/member is invisible to
    // tenant-scoped reads, and deleted rows are deliberately excluded from the
    // move/clone reconciliation above — so they must be excluded here too or the
    // backstop would false-positive on a dead link.
    const strandedWorkflows = await client.workflow.count({
      where: {
        brands: { some: { id: brandId } },
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });
    const strandedMembers = await client.member.count({
      where: {
        brands: { some: { id: brandId } },
        organizationId: { not: destOrgId },
      },
    });
    // A workflow we MOVED must not still be linked to a brand left in a source org —
    // that would make a destination-org workflow drive a foreign-org brand.
    const crossOrgMovedWorkflows =
      movedWorkflowIds.length > 0
        ? await client.workflow.count({
            where: {
              brands: { some: { organizationId: { not: destOrgId } } },
              id: { in: movedWorkflowIds },
              isDeleted: false,
            },
          })
        : 0;

    if (
      strandedWorkflows > 0 ||
      strandedMembers > 0 ||
      crossOrgMovedWorkflows > 0
    ) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: cross-org association(s) survived the move ` +
          `(workflows stranded in source org: ${strandedWorkflows}, members: ${strandedMembers}, ` +
          `moved workflows still linked to a source-org brand: ${crossOrgMovedWorkflows}).`,
      );
    }
  }

  /**
   * Safety net: after the cascade, assert no brand-owned row still points at a stale
   * org. Part A verifies every configured table (correct field pairing). Part B
   * discovers ANY other dual-keyed table via information_schema and blocks the move
   * if it would orphan rows — so a forgotten/future table rolls back loudly instead
   * of silently splitting tenancy.
   */
  private async assertNoBrandOrgOrphans(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<void> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    const stale: string[] = [];
    for (const target of FIRST_ORDER_TARGETS) {
      const remaining = await client[target.delegate].count({
        where: {
          [target.brandField]: brandId,
          [target.orgField]: { not: destOrgId },
        },
      });
      if (remaining > 0) {
        stale.push(`${target.delegate} (${remaining})`);
      }
    }
    if (stale.length > 0) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: cascade left stale organization id on ${stale.join(', ')}.`,
      );
    }

    const knownTables = new Set<string>([
      ...FIRST_ORDER_TARGETS.map((target) => target.table),
      ...AUDITOR_IGNORED_TABLES,
    ]);

    // sql-risk-audit: ignore raw-sql-review -- static information_schema introspection, no caller input interpolated.
    const candidates = await tx.$queryRaw<
      { table_name: string; brand_col: string; org_col: string }[]
    >`SELECT c1.table_name AS table_name, c1.column_name AS brand_col, c2.column_name AS org_col
       FROM information_schema.columns c1
       JOIN information_schema.columns c2
         ON c1.table_name = c2.table_name AND c1.table_schema = c2.table_schema
       WHERE c1.table_schema = 'public'
         AND c1.column_name LIKE '%brand_id'
         AND (c2.column_name LIKE '%organization_id' OR c2.column_name LIKE '%org_id')`;

    const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
    const unhandled: string[] = [];
    for (const candidate of candidates) {
      if (knownTables.has(candidate.table_name)) {
        continue;
      }
      if (
        !IDENTIFIER.test(candidate.table_name) ||
        !IDENTIFIER.test(candidate.brand_col) ||
        !IDENTIFIER.test(candidate.org_col)
      ) {
        continue;
      }
      // sql-risk-audit: ignore raw-sql-review -- table/column identifiers are regex-validated to /^[a-z_][a-z0-9_]*$/ above and injected via Prisma.raw; brandId/destOrgId are bound as parameters.
      const rows = await tx.$queryRaw<
        { n: number }[]
      >`SELECT COUNT(*)::int AS n FROM ${Prisma.raw(`"${candidate.table_name}"`)} WHERE ${Prisma.raw(`"${candidate.brand_col}"`)} = ${brandId} AND ${Prisma.raw(`"${candidate.org_col}"`)} IS DISTINCT FROM ${destOrgId}`;
      const count = rows[0]?.n ?? 0;
      if (count > 0) {
        unhandled.push(
          `${candidate.table_name}.${candidate.brand_col}/${candidate.org_col} (${count})`,
        );
      }
    }
    if (unhandled.length > 0) {
      throw new InternalServerErrorException(
        `Brand relocation aborted: unhandled dual-keyed table(s) would be orphaned in the source org: ${unhandled.join(', ')}. Add them to FIRST_ORDER_TARGETS in brand-org-cascade.constants.ts.`,
      );
    }
  }

  private async invalidateRelocationCaches(
    brandId: string,
    sourceOrgId: string,
    destOrgId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(sourceOrgId),
      CACHE_PATTERNS.BRANDS_LIST(destOrgId),
    );
    await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.BRANDS]);
    await this.cacheInvalidationService.invalidatePattern(
      `${CACHE_TAGS.BRANDS}:*`,
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
