import { randomUUID } from 'node:crypto';
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
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { FileInputType, FontFamily, MemberRole } from '@genfeedai/enums';
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
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

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
 * preview endpoint and the transactional move itself.
 */
interface RelocationImpact {
  soleBrandWorkflowIds: string[];
  staleMemberIds: string[];
}

/** Outcome of reconciling a brand's cross-org workflow/member links during a move. */
interface RelocationReconcileResult {
  workflowsMoved: number;
  membersSevered: number;
}

export interface BrandRelocationMovingResource {
  resource: string;
  label: string;
  count: number;
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

/** Counts returned by the read-only relocation preview endpoint. */
export interface BrandRelocationPreview {
  counts: {
    soleBrandWorkflows: number;
    /** Always 0 after workflow brand ownership became one-to-one. */
    sharedWorkflows: number;
    staleMembers: number;
  };
  movingResources: BrandRelocationMovingResource[];
  /** Always null after workflow brand ownership became one-to-one. */
  ackToken: string | null;
}

const EMPTY_RELOCATION_SUMMARY: BrandRelocationSummary = {
  workflowsMoved: 0,
  workflowsClonedActive: 0,
  workflowsClonedPaused: 0,
  membersSevered: 0,
  schedulingPending: 0,
};

const RELOCATION_RESOURCE_LABELS: Record<
  string,
  { singular: string; plural: string }
> = {
  adBulkUploadJob: {
    singular: 'ad bulk upload job',
    plural: 'ad bulk upload jobs',
  },
  adCreativeMapping: {
    singular: 'ad creative mapping',
    plural: 'ad creative mappings',
  },
  adPerformance: {
    singular: 'ad performance record',
    plural: 'ad performance records',
  },
  activity: { singular: 'activity', plural: 'activities' },
  agentCampaign: { singular: 'agent campaign', plural: 'agent campaigns' },
  agentGoal: { singular: 'agent goal', plural: 'agent goals' },
  agentMemory: { singular: 'agent memory', plural: 'agent memories' },
  agentMessage: { singular: 'agent message', plural: 'agent messages' },
  agentStrategy: { singular: 'agent strategy', plural: 'agent strategies' },
  agentStrategyOpportunity: {
    singular: 'agent strategy opportunity',
    plural: 'agent strategy opportunities',
  },
  agentStrategyReport: {
    singular: 'agent strategy report',
    plural: 'agent strategy reports',
  },
  articleAnalytics: {
    singular: 'article analytics record',
    plural: 'article analytics records',
  },
  article: { singular: 'article', plural: 'articles' },
  asset: { singular: 'asset', plural: 'assets' },
  batchWorkflowJob: {
    singular: 'batch workflow job',
    plural: 'batch workflow jobs',
  },
  batch: { singular: 'batch', plural: 'batches' },
  bookmark: { singular: 'bookmark', plural: 'bookmarks' },
  botActivity: { singular: 'bot activity', plural: 'bot activities' },
  bot: { singular: 'bot', plural: 'bots' },
  brandInterview: {
    singular: 'brand interview',
    plural: 'brand interviews',
  },
  brandMemory: { singular: 'brand memory', plural: 'brand memories' },
  campaignTarget: { singular: 'campaign target', plural: 'campaign targets' },
  caption: { singular: 'caption', plural: 'captions' },
  clipProject: { singular: 'clip project', plural: 'clip projects' },
  contentPerformance: {
    singular: 'content performance record',
    plural: 'content performance records',
  },
  contentDraft: { singular: 'content draft', plural: 'content drafts' },
  contentPlan: { singular: 'content plan', plural: 'content plans' },
  contentPlanItem: {
    singular: 'content plan item',
    plural: 'content plan items',
  },
  contentRun: { singular: 'content run', plural: 'content runs' },
  contextBase: { singular: 'context base', plural: 'context bases' },
  contextEntry: { singular: 'context entry', plural: 'context entries' },
  credential: { singular: 'credential', plural: 'credentials' },
  creativePattern: {
    singular: 'creative pattern',
    plural: 'creative patterns',
  },
  distribution: { singular: 'distribution', plural: 'distributions' },
  editorProject: {
    singular: 'editor project',
    plural: 'editor projects',
  },
  folder: { singular: 'folder', plural: 'folders' },
  ingredient: { singular: 'ingredient', plural: 'ingredients' },
  lead: { singular: 'lead', plural: 'leads' },
  model: { singular: 'model', plural: 'models' },
  monitoredAccount: {
    singular: 'monitored account',
    plural: 'monitored accounts',
  },
  moodBoard: { singular: 'mood board', plural: 'mood boards' },
  newsletter: { singular: 'newsletter', plural: 'newsletters' },
  outreachCampaign: {
    singular: 'outreach campaign',
    plural: 'outreach campaigns',
  },
  persona: { singular: 'persona', plural: 'personas' },
  post: { singular: 'post', plural: 'posts' },
  postAnalytics: {
    singular: 'post analytics record',
    plural: 'post analytics records',
  },
  preset: { singular: 'preset', plural: 'presets' },
  processedTweet: {
    singular: 'processed tweet',
    plural: 'processed tweets',
  },
  prompt: { singular: 'prompt', plural: 'prompts' },
  replyBotConfig: {
    singular: 'reply bot config',
    plural: 'reply bot configs',
  },
  run: { singular: 'run', plural: 'runs' },
  schedule: { singular: 'schedule', plural: 'schedules' },
  socialConversation: {
    singular: 'social conversation',
    plural: 'social conversations',
  },
  socialMessage: { singular: 'social message', plural: 'social messages' },
  tag: { singular: 'tag', plural: 'tags' },
  task: { singular: 'task', plural: 'tasks' },
  taskComment: { singular: 'task comment', plural: 'task comments' },
  training: { singular: 'training', plural: 'trainings' },
  trackedLink: { singular: 'tracked link', plural: 'tracked links' },
  transcript: { singular: 'transcript', plural: 'transcripts' },
  trend: { singular: 'trend', plural: 'trends' },
  trendPreferences: {
    singular: 'trend preference',
    plural: 'trend preferences',
  },
  trendRemixLineage: {
    singular: 'trend remix lineage',
    plural: 'trend remix lineages',
  },
  warmupAccount: {
    singular: 'warmup account',
    plural: 'warmup accounts',
  },
  watchlist: { singular: 'watchlist', plural: 'watchlists' },
  workflowExecution: {
    singular: 'workflow execution',
    plural: 'workflow executions',
  },
  workflow: { singular: 'workflow', plural: 'workflows' },
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
    this.logger.log('Relocating brand between organizations', {
      brandId,
      destOrgId,
      operation: 'relocateToOrganization',
      service: this.constructorName,
      sourceOrgId,
    });

    let reconcileResult: RelocationReconcileResult = {
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
            const result = await this.runBrandOrgCascade(
              tx,
              brandId,
              destOrgId,
              passthrough,
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
          const uniqueTarget = (error as Prisma.PrismaClientKnownRequestError)
            .meta?.target;
          const target = Array.isArray(uniqueTarget)
            ? uniqueTarget.join(', ')
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

    const moved = (await this.delegate.findFirst({
      where: { id: brandId },
    })) as BrandDocument | null;
    if (!moved) {
      throw new NotFoundException('Brand', brandId);
    }

    return {
      brand: moved,
      summary: {
        membersSevered: reconcileResult.membersSevered,
        schedulingPending: 0,
        workflowsClonedActive: 0,
        workflowsClonedPaused: 0,
        workflowsMoved: reconcileResult.workflowsMoved,
      },
    };
  }

  /**
   * Read-only preview for a brand relocation. Workflows are one-to-one with a
   * brand now, so they move with the brand and shared workflow clone confirmation
   * is no longer needed. `ackToken` remains for response compatibility.
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
    const movingResources = await this.countRelocationMovingResources(
      this.prisma as unknown as Prisma.TransactionClient,
      brandId,
      destOrgId,
    );

    return {
      ackToken: null,
      counts: {
        sharedWorkflows: 0,
        soleBrandWorkflows: impact.soleBrandWorkflowIds.length,
        staleMembers: impact.staleMemberIds.length,
      },
      movingResources,
    };
  }

  private async countRelocationMovingResources(
    client: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
  ): Promise<BrandRelocationMovingResource[]> {
    const delegateClient = client as unknown as Record<string, CascadeDelegate>;
    const firstOrderResources = await Promise.all(
      FIRST_ORDER_TARGETS.map(async (target) => {
        const count = await delegateClient[target.delegate].count({
          where: {
            [target.brandField]: brandId,
            [target.orgField]: { not: destOrgId },
          },
        });
        return this.toMovingResource(target.delegate, count);
      }),
    );

    const secondOrderResources = await Promise.all(
      SECOND_ORDER_TARGETS.map(async (child) => {
        const orClauses: Record<string, unknown>[] = [];
        await Promise.all(
          child.parents.map(async (parent) => {
            const parentRows = await delegateClient[
              parent.parentDelegate
            ].findMany({
              select: { id: true },
              where: { [parent.parentBrandField]: brandId },
            });
            if (parentRows.length > 0) {
              orClauses.push({
                [parent.fkField]: { in: parentRows.map((row) => row.id) },
              });
            }
          }),
        );
        if (orClauses.length === 0) {
          return null;
        }

        const count = await delegateClient[child.delegate].count({
          where: {
            OR: orClauses,
            [child.orgField]: { not: destOrgId },
          },
        });
        return this.toMovingResource(child.delegate, count);
      }),
    );

    return [...firstOrderResources, ...secondOrderResources].filter(
      (resource): resource is BrandRelocationMovingResource =>
        resource !== null,
    );
  }

  private toMovingResource(
    resource: string,
    count: number,
  ): BrandRelocationMovingResource | null {
    if (count <= 0) {
      return null;
    }
    return {
      count,
      label: this.formatRelocationResourceLabel(resource, count),
      resource,
    };
  }

  private formatRelocationResourceLabel(
    resource: string,
    count: number,
  ): string {
    const labels = RELOCATION_RESOURCE_LABELS[resource];
    if (labels) {
      return count === 1 ? labels.singular : labels.plural;
    }

    const words = resource.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return `${words} ${count === 1 ? 'record' : 'records'}`;
  }

  /**
   * Read-only classification of workflow/member links that a relocation of
   * `brandId` to `destOrgId` would touch. Workflows are one-to-one with a brand,
   * so every live source-org workflow for the brand moves with it.
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

    // Workflows owned by the moving brand but sitting in a source (non-dest) org.
    // Soft-deleted workflows are excluded: they are invisible to tenant reads and
    // should not be resurrected by relocation accounting.
    const crossOrgWorkflows = await delegateClient.workflow.findMany({
      select: { id: true },
      where: {
        brandId,
        isDeleted: false,
        organizationId: { not: destOrgId },
      },
    });

    return {
      soleBrandWorkflowIds: crossOrgWorkflows.map((w) => w.id),
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
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate>;

    const impact = await this.classifyRelocationImpact(tx, brandId, destOrgId);

    // 1. The brand row itself (+ any co-patched scalar fields). The workflow
    // composite FK cascades workflow.organizationId with the brand.
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

    // 4. Reconcile associations that would become cross-org (move workflows/history,
    //    sever stale members).
    return this.reconcileCrossOrgLinks(tx, brandId, destOrgId, impact);
  }

  /**
   * Reconcile source-org associations that become cross-org after the move.
   *
   * Members still link to brands through a many-to-many join table and never move
   * with the brand — their stale brand links are severed. Workflows are scalar
   * brand-owned rows now, so they move one-to-one with the brand and their
   * execution/batch history follows by workflow id.
   *
   * The acting user keeps access to the brand because relocation requires membership in
   * the destination org.
   */
  private async reconcileCrossOrgLinks(
    tx: Prisma.TransactionClient,
    brandId: string,
    destOrgId: string,
    impact: RelocationImpact,
  ): Promise<RelocationReconcileResult> {
    const client = tx as unknown as Record<string, CascadeDelegate> & {
      brand: {
        update(args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }): Promise<unknown>;
      };
    };

    const workflowsToMove = impact.soleBrandWorkflowIds;
    const staleMemberIds = impact.staleMemberIds;

    // Disconnect stale members from the brand. Member rows stay in their source org.
    if (staleMemberIds.length > 0) {
      await client.brand.update({
        data: {
          members: { disconnect: staleMemberIds.map((id) => ({ id })) },
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

    // Move brand-owned workflows (definition + org-keyed execution/batch history)
    // into the destination org. The scalar workflow.brandId stays unchanged.
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

    // Clear per-member "last used brand" pointers left in other orgs.
    await client.member.updateMany({
      data: { lastUsedBrandId: null },
      where: { lastUsedBrandId: brandId, organizationId: { not: destOrgId } },
    });

    // Runtime backstop for member many-to-many links plus workflow rows classified
    // before the brand update. Still inside the transaction, recompute the post-state
    // and roll the whole move back if any cross-org association survived.
    await this.assertNoCrossOrgBrandLinks(
      client,
      brandId,
      destOrgId,
      workflowsToMove,
    );

    return {
      membersSevered: staleMemberIds.length,
      workflowsMoved: workflowsToMove.length,
    };
  }

  /**
   * Post-sever invariant for brand-linked resources that need extra checks beyond
   * the generic scalar-column orphan auditor. Throws (rolling back the transaction)
   * if any survived cross-org.
   */
  private async assertNoCrossOrgBrandLinks(
    client: Record<string, CascadeDelegate>,
    brandId: string,
    destOrgId: string,
    movedWorkflowIds: string[],
  ): Promise<void> {
    // Nothing should still be attached to the moved brand from a source org.
    // Only LIVE links matter: a soft-deleted workflow/member is invisible to
    // tenant-scoped reads and is deliberately excluded from relocation accounting.
    const strandedWorkflows = await client.workflow.count({
      where: {
        brandId,
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
    const crossOrgMovedWorkflows =
      movedWorkflowIds.length > 0
        ? await client.workflow.count({
            where: {
              id: { in: movedWorkflowIds },
              isDeleted: false,
              organizationId: { not: destOrgId },
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
