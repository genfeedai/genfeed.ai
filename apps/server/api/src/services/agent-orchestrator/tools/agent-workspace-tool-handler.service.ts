import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { resolveGenerationBrand } from '@api/collections/brands/utils/resolve-generation-brand.util';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import {
  IngredientCharacterFilterService,
  resolveCharacterFilter,
} from '@api/collections/ingredients/services/ingredient-character-filter.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { resolvePublishValidationMedia } from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import {
  categoryToPlural,
  IngredientCategory,
  MemberRole,
  parseIngredientOrigin,
  parseLibraryShelf,
  parseTagMatchMode,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import {
  serializeAgentBrand,
  serializeAgentBrands,
} from '@genfeedai/serializers';
import { readIngredientMediaUrlWithFallback } from '@libs/media/media-url.util';
import { HttpException, Inject, Injectable, Optional } from '@nestjs/common';

type AgentBrandsServiceLike = {
  findAll: (
    query: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<{ docs?: unknown[] }>;
  findOne: (
    query: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
};

type AgentMembersServiceLike = {
  findOne: (
    query: Record<string, unknown>,
    populate?: unknown[],
  ) => Promise<{
    currentBrandId?: unknown;
    role?: { key?: unknown } | null;
  } | null>;
};

const MEMBER_ROLES: ReadonlySet<string> = new Set(Object.values(MemberRole));

function isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLES.has(value);
}

/**
 * Workspace read tools: credits, brands, posts list, studio handoff.
 * Extracted from AgentToolExecutorService per #519.
 */
const MAX_CHARACTER_IDS = 25;

/** Character ids to filter by, or an error message for invalid input. */
function readCharacterIds(value: unknown): string[] | string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length > MAX_CHARACTER_IDS ||
    value.some((id) => typeof id !== 'string' || !isEntityId(id))
  ) {
    return `characterIds must be at most ${MAX_CHARACTER_IDS} character ids.`;
  }
  return value;
}

const MAX_TAG_IDS = 25;

/** Tag ids to filter by, or an error message for invalid input. */
function readTagIds(value: unknown): string[] | string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length > MAX_TAG_IDS ||
    value.some((id) => typeof id !== 'string' || !isEntityId(id))
  ) {
    return `tags must be at most ${MAX_TAG_IDS} tag ids.`;
  }
  return value;
}

@Injectable()
export class AgentWorkspaceToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Inject('AGENT_MEMBERS_SERVICE')
    private readonly membersService: AgentMembersServiceLike,
    private readonly postsService: PostsService,
    private readonly personasService: PersonasService,
    private readonly presignedUploadService: PresignedUploadService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly ingredientsService: IngredientsService,
    @Optional()
    private readonly characterFilter?: IngredientCharacterFilterService,
    @Optional()
    private readonly usersService?: UsersService,
  ) {}

  /**
   * `get_account`: profile, credits and usage in one read. Sections default to
   * all three; `include` narrows them.
   */
  async getAccount(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const sections = readAccountSections(params.include);
    if (!sections) {
      return toolFailure(
        `include must be an array of: ${ACCOUNT_SECTIONS.join(', ')}.`,
      );
    }

    const data: Record<string, unknown> = {};
    if (sections.has('profile')) {
      data.profile = await this.readAccountProfile(ctx);
    }
    if (sections.has('credits')) {
      data.credits = {
        balance: await this.creditsUtilsService.getOrganizationCreditsBalance(
          ctx.organizationId,
        ),
      };
    }
    if (sections.has('usage')) {
      // The daily/weekly/monthly series feed dashboard charts, not agents.
      const metrics = await this.creditTransactionsService.getUsageMetrics(
        ctx.organizationId,
      );
      data.usage = {
        breakdown: metrics.breakdown,
        currentBalance: metrics.currentBalance,
        trendPercentage: metrics.trendPercentage,
        usage7Days: metrics.usage7Days,
        usage30Days: metrics.usage30Days,
      };
    }

    return { creditsUsed: 0, data, success: true };
  }

  private async readAccountProfile(
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown>> {
    const brandId = ctx.brandId ?? ctx.validatedScope?.brandId;
    const isOnboardingCompleted = await this.resolveOnboardingCompleted(ctx);
    return {
      ...(brandId ? { brandId } : {}),
      ...(isOnboardingCompleted === undefined ? {} : { isOnboardingCompleted }),
      organizationId: ctx.organizationId,
      role: await this.resolveOrganizationRole(ctx),
      userId: ctx.userId,
    };
  }

  /**
   * Whether the caller finished first-run onboarding. An MCP client that signed
   * up during the OAuth connect never sees the web onboarding, so it reads this
   * to know it must run `onboard_brand` first. Omitted when unresolved.
   */
  private async resolveOnboardingCompleted(
    ctx: ToolExecutionContext,
  ): Promise<boolean | undefined> {
    if (!this.usersService) {
      return undefined;
    }
    try {
      const user = await this.usersService.findOne({ id: ctx.userId });
      return user ? user.isOnboardingCompleted === true : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The caller's organization role key from their active membership. Fails
   * closed to `''` so an unresolved membership is never shown as a role.
   */
  private async resolveOrganizationRole(
    ctx: ToolExecutionContext,
  ): Promise<string> {
    try {
      const member = await this.membersService.findOne(
        {
          isActive: true,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
        [PopulateBuilder.withFields('role', ['id', 'key', 'label'])],
      );
      const key = typeof member?.role?.key === 'string' ? member.role.key : '';
      // An API key never inherits its issuer's org-admin role without an
      // explicit admin scope — the same cap `/auth/whoami` applies.
      return ctx.apiKeyContext && isMemberRole(key)
        ? resolveApiKeyEffectiveMemberRole(ctx.apiKeyContext, key)
        : key;
    } catch {
      return '';
    }
  }

  /**
   * `get_brands`: every brand in the organization, or the one matching
   * `brand` by id, slug, name or label. The lookup is a plain `brand` field,
   * not `brandId`, so it never collides with thread brand-scope checks.
   */
  async getBrands(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brands = await this.brandsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
      },
      {},
    );
    const serialized = serializeAgentBrands(
      (brands.docs as Record<string, unknown>[] | undefined) ?? [],
    );

    const requested = readRequiredString(params.brand);
    if (!requested) {
      return { creditsUsed: 0, data: { brands: serialized }, success: true };
    }

    const needle = requested.toLowerCase();
    const brand = serialized.find((entry) =>
      [entry.id, entry.slug, entry.name, entry.label].some(
        (value) => value.trim().toLowerCase() === needle,
      ),
    );
    if (!brand) {
      return toolFailure('Brand was not found in this organization.');
    }

    return { creditsUsed: 0, data: { brand }, success: true };
  }

  /**
   * `list_assets`: library assets of one type for the organization, or the
   * named characters the current brand can use.
   */
  async listAssets(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const type = readAssetType(params.type);
    if (!type) {
      return toolFailure(
        `list_assets requires type: ${ASSET_TYPES.join(', ')}.`,
      );
    }

    if (type === 'character') {
      const misused = [
        'characterIds',
        'limit',
        'offset',
        'origin',
        'shelf',
        'tagMatch',
        'tags',
      ].filter((key) => params[key] !== undefined && params[key] !== null);
      if (misused.length > 0) {
        return toolFailure(
          `${misused.join(', ')} do not apply to type character.`,
        );
      }
      const characterBrand = await this.resolveAssetBrand(params, ctx);
      if ('error' in characterBrand) return characterBrand.error;
      return this.listCharacters(params, {
        ...ctx,
        ...(characterBrand.brandId ? { brandId: characterBrand.brandId } : {}),
      });
    }

    if (params.q !== undefined && params.q !== null) {
      return toolFailure('q applies only to type character.');
    }

    const characterIds = readCharacterIds(params.characterIds);
    if (typeof characterIds === 'string') {
      return toolFailure(characterIds);
    }

    const rawOrigin = params.origin;
    const hasOrigin =
      rawOrigin !== undefined && rawOrigin !== null && rawOrigin !== '';
    const origin = hasOrigin ? parseIngredientOrigin(rawOrigin) : undefined;
    if (hasOrigin && !origin) {
      return toolFailure(
        'origin must be UPLOADED, GENERATED, IMPORTED or UNKNOWN.',
      );
    }

    const hasShelf =
      params.shelf !== undefined &&
      params.shelf !== null &&
      params.shelf !== '';
    const shelf = hasShelf ? parseLibraryShelf(params.shelf) : undefined;
    if (hasShelf && !shelf) {
      return toolFailure('shelf must be a valid Library shelf.');
    }

    const tagIds = readTagIds(params.tags);
    if (typeof tagIds === 'string') {
      return toolFailure(tagIds);
    }

    const rawTagMatch = params.tagMatch;
    const hasTagMatch =
      rawTagMatch !== undefined && rawTagMatch !== null && rawTagMatch !== '';
    const tagMatch = hasTagMatch ? parseTagMatchMode(rawTagMatch) : undefined;
    if (hasTagMatch && !tagMatch) {
      return toolFailure('tagMatch must be any or all.');
    }

    const brandScope = await this.resolveAssetBrand(params, ctx);
    if ('error' in brandScope) return brandScope.error;
    const brandId = brandScope.brandId;
    // The Library character filter decides availability; a character the
    // brand cannot use matches nothing.
    const characterFilter = await resolveCharacterFilter(this.characterFilter, {
      characterIds,
      explicitBrandId: brandId,
      user: { brandId: ctx.brandId, organizationId: ctx.organizationId },
    });
    const assets = await this.ingredientsService.listLibraryAssets({
      ...(brandId ? { brandId } : {}),
      ...(characterIds ? { characterFilter } : {}),
      category: ASSET_TYPE_CATEGORY[type],
      limit: clampInteger(params.limit, 10, 1, 50),
      offset: clampInteger(params.offset, 0, 0, Number.MAX_SAFE_INTEGER),
      organizationId: ctx.organizationId,
      origin,
      ...(shelf ? { shelf } : {}),
      ...(tagIds
        ? { tagFilter: IngredientFilterUtil.buildTagFilter(tagIds, tagMatch) }
        : {}),
    });

    return {
      creditsUsed: 0,
      data: {
        assets: assets.map((asset) => toListedAsset(asset)),
        count: assets.length,
        type,
      },
      success: true,
    };
  }

  /**
   * Brand for an asset listing: an explicit `brandId` (must belong to the
   * organization), else the thread brand, else the member's current brand.
   * With none, the listing spans the organization — it is read-only and
   * already tenant-scoped.
   */
  private async resolveAssetBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ brandId?: string } | { error: AgentToolResult }> {
    const explicitBrandId = readRequiredString(params.brandId);
    const brand = await resolveGenerationBrand({
      brandsService: this.brandsService,
      contextBrandId: ctx.brandId ?? ctx.validatedScope?.brandId,
      explicitBrandId,
      membersService: this.membersService,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    const brandId = typeof brand?.id === 'string' ? brand.id : undefined;
    if (explicitBrandId && brandId !== explicitBrandId) {
      return {
        error: toolFailure('Brand was not found in this organization.'),
      };
    }
    return brandId ? { brandId } : {};
  }

  private async listCharacters(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const mentions = await this.personasService.listCharacterMentions({
      brandId: ctx.brandId,
      organizationId: ctx.organizationId,
      q: typeof params.q === 'string' ? params.q : undefined,
    });

    return {
      creditsUsed: 0,
      data: {
        characters: mentions.map((mention) => ({
          description: mention.label,
          handle: mention.handle,
          hasReferenceImage: mention.hasReferenceImage,
          label: mention.label,
        })),
      },
      success: true,
    };
  }

  async getCurrentBrand(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    // Prefer explicit thread/run scope over the member's currentBrandId (#5219).
    // Agent turns always carry brandId in context when the URL/thread has one.
    const scopedBrandId = ctx.brandId || ctx.validatedScope?.brandId;

    const currentBrand = await this.findCurrentBrand(ctx);

    if (!currentBrand) {
      return {
        creditsUsed: 0,
        error: scopedBrandId
          ? `Brand ${scopedBrandId} was not found for this organization.`
          : 'No brand is currently selected. Please select a brand first.',
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        currentBrand: serializeAgentBrand(
          currentBrand as unknown as Record<string, unknown>,
        ),
      },
      success: true,
    };
  }

  private findCurrentBrand(
    ctx: ToolExecutionContext,
  ): Promise<Record<string, unknown> | null> {
    const scopedBrandId = ctx.brandId || ctx.validatedScope?.brandId;
    // #5219: thread/route scope first, then the acting member's
    // currentBrandId. No implicit "any brand in the org" fallback.
    return resolveGenerationBrand({
      brandsService: this.brandsService,
      contextBrandId: scopedBrandId,
      membersService: this.membersService,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
  }

  async listPosts(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = (params.limit as number) || 10;
    const matchStage: Record<string, unknown> = {
      isDeleted: false,
      organizationId: ctx.organizationId,
    };

    const executionState = params.executionState;
    if (
      typeof executionState === 'string' &&
      Object.values(TargetExecutionState).includes(
        executionState as TargetExecutionState,
      )
    ) {
      Object.assign(
        matchStage,
        postExecutionStateReadFilter(executionState as TargetExecutionState),
      );
    }

    const posts = await this.postsService.findAll(
      {
        include: LISTED_POST_MEDIA_INCLUDE,
        orderBy: { createdAt: -1 },
        where: matchStage,
      },
      { limit },
    );

    return {
      creditsUsed: 0,
      data: {
        count: posts.docs?.length ?? 0,
        posts:
          posts.docs?.map((post) =>
            toListedPost(post as unknown as Record<string, unknown>),
          ) ?? [],
      },
      success: true,
    };
  }

  async getPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const postId = readRequiredString(params.postId);
    if (!postId) {
      return toolFailure('get_posts requires postId.');
    }

    const post = await this.postsService.findOne({
      id: postId,
      isDeleted: false,
      organizationId: ctx.organizationId,
    });
    if (!post) {
      return toolFailure(`Post ${postId} was not found.`);
    }

    return {
      creditsUsed: 0,
      data: {
        post: toListedPost(post as unknown as Record<string, unknown>),
      },
      success: true,
    };
  }

  async requestMediaUpload(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const filename = readRequiredString(params.filename);
    const contentType = readRequiredString(params.contentType)?.toLowerCase();
    const categoryName = readUploadCategory(params.category);
    if (!filename || !contentType || !categoryName) {
      return toolFailure(
        'request_media_upload requires filename, contentType, and category (image, video, audio, or music).',
      );
    }

    const constraints = UPLOAD_CONSTRAINTS[categoryName];
    if (
      !constraints.contentTypes.includes(
        contentType as (typeof constraints.contentTypes)[number],
      )
    ) {
      return toolFailure(
        `contentType must be one of: ${constraints.contentTypes.join(', ')}.`,
      );
    }

    const extension = filenameExtension(filename);
    if (
      !extension ||
      !constraints.extensions.includes(
        extension as (typeof constraints.extensions)[number],
      )
    ) {
      return toolFailure(
        `filename must end with one of: ${constraints.extensions.join(', ')}.`,
      );
    }

    try {
      const brand = await this.findCurrentBrand(ctx);
      const brandId =
        brand && typeof brand === 'object' && 'id' in brand
          ? readRequiredString(brand.id)
          : undefined;
      if (!brandId) {
        return toolFailure(
          'Select a valid brand in this organization before requesting a media upload.',
        );
      }
      const uploadUser = toUploadUser({ ...ctx, brandId });
      const presigned = await this.presignedUploadService.getPresignedUploadUrl(
        uploadUser,
        {
          category: UPLOAD_CATEGORY_TO_INGREDIENT[categoryName],
          contentType,
          filename,
        },
      );
      const method = presigned.uploadMethod;

      return {
        creditsUsed: 0,
        data: {
          assetId: presigned.id,
          constraints: {
            acceptedExtensions: constraints.extensions,
            category: categoryName,
            contentType,
            expiresInSeconds: presigned.expiresIn,
            maxBytes: constraints.maxBytes,
            method,
          },
          expiresIn: presigned.expiresIn,
          key: presigned.s3Key,
          method,
          publicUrl: presigned.publicUrl,
          ...(method === 'PUT'
            ? { headers: { 'Content-Type': contentType } }
            : {
                localUpload: {
                  key: presigned.id,
                  source: { contentType, type: 'base64' },
                  type: categoryToPlural(
                    UPLOAD_CATEGORY_TO_INGREDIENT[categoryName],
                  ),
                },
              }),
          uploadUrl: presigned.uploadUrl,
        },
        success: true,
      };
    } catch (error: unknown) {
      return toolFailure(readToolError(error));
    }
  }

  async completeMediaUpload(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const assetId = readRequiredString(params.assetId);
    if (!assetId) {
      return toolFailure('complete_media_upload requires assetId.');
    }

    try {
      const ingredient = await this.presignedUploadService.confirmUpload(
        toUploadUser(ctx),
        assetId,
      );
      const hostedUrl = readHostedUrl(ingredient);
      const media = toCompletedMedia(ingredient, assetId);

      return {
        creditsUsed: 0,
        data: {
          assetId,
          contentId: assetId,
          ingredientId: assetId,
          ...(media.length > 0
            ? { media }
            : { media: [{ assetId, order: 0 }] }),
          status: ingredient.status,
          ...(hostedUrl ? { url: hostedUrl } : {}),
        },
        success: true,
      };
    } catch (error: unknown) {
      return toolFailure(readToolError(error));
    }
  }

  async openStudioHandoff(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const ingredientId = params.ingredientId
      ? String(params.ingredientId).trim()
      : '';
    if (!ingredientId) {
      return {
        creditsUsed: 0,
        error:
          'open_studio_handoff requires ingredientId of an existing asset. To generate a new image or video, call prepare_generation. One-off generation stays in Agent.',
        success: false,
      };
    }

    const type = String(params.type || 'image');
    const href = createLibraryAssetRoute(
      studioHandoffCategory(type),
      ingredientId,
    );

    return {
      creditsUsed: 0,
      data: { href, ingredientId, type },
      nextActions: [
        {
          ctas: [{ href, label: 'View in Library' }],
          data: { href, ingredientId, type },
          editorType: type,
          id: `studio-handoff-${ingredientId}`,
          studioUrl: href,
          title: 'Open in Library',
          type: 'studio_handoff_card',
        },
      ],
      success: true,
    };
  }
}

const ACCOUNT_SECTIONS = ['profile', 'credits', 'usage'] as const;

type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

function readAccountSections(value: unknown): Set<AccountSection> | undefined {
  if (value === undefined || value === null) {
    return new Set(ACCOUNT_SECTIONS);
  }
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const sections = new Set<AccountSection>();
  for (const entry of value) {
    const section = ACCOUNT_SECTIONS.find((name) => name === entry);
    if (!section) {
      return undefined;
    }
    sections.add(section);
  }
  return sections;
}

const ASSET_TYPES = ['image', 'video', 'music', 'avatar', 'character'] as const;

type AssetType = (typeof ASSET_TYPES)[number];

const ASSET_TYPE_CATEGORY = {
  avatar: IngredientCategory.AVATAR,
  image: IngredientCategory.IMAGE,
  music: IngredientCategory.MUSIC,
  video: IngredientCategory.VIDEO,
} as const satisfies Record<
  Exclude<AssetType, 'character'>,
  IngredientCategory
>;

function readAssetType(value: unknown): AssetType | undefined {
  return ASSET_TYPES.find((name) => name === value);
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toListedAsset(asset: IngredientDocument): Record<string, unknown> {
  return {
    category: asset.category,
    createdAt: asset.createdAt ?? null,
    id: String(asset.id),
    origin: asset.origin ?? null,
    prompt: asset.generationPrompt ?? null,
    status: asset.status,
    tags: toListedTags(asset.tags),
    url: readIngredientMediaUrlWithFallback(asset) ?? null,
  };
}

/** The id and label of each tag an asset carries, so an agent can filter by them. */
function toListedTags(value: unknown): Array<{ id: string; label: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((tag: unknown) => {
    if (typeof tag !== 'object' || tag === null) {
      return [];
    }
    const { id, label } = tag as { id?: unknown; label?: unknown };
    return typeof id === 'string' && typeof label === 'string'
      ? [{ id, label }]
      : [];
  });
}

function studioHandoffCategory(type: string): IngredientCategory {
  switch (type) {
    case 'avatar':
      return IngredientCategory.AVATAR;
    case 'music':
      return IngredientCategory.MUSIC;
    case 'video':
      return IngredientCategory.VIDEO;
    default:
      return IngredientCategory.IMAGE;
  }
}

const LISTED_POST_MEDIA_INCLUDE = {
  ingredients: { select: { category: true, id: true } },
} as const;

const UPLOAD_CATEGORY_NAMES = ['image', 'video', 'audio', 'music'] as const;

type UploadCategoryName = (typeof UPLOAD_CATEGORY_NAMES)[number];

const UPLOAD_CATEGORY_TO_INGREDIENT = {
  audio: IngredientCategory.AUDIO,
  image: IngredientCategory.IMAGE,
  music: IngredientCategory.MUSIC,
  video: IngredientCategory.VIDEO,
} as const satisfies Record<UploadCategoryName, IngredientCategory>;

/**
 * Library upload limits (`getMaxFileSize` / `getAcceptedTypes` in the upload
 * modal) plus the MIME types the presigned PUT signs, narrowed to the types
 * `MetadataExtension` can store (no MKV, AAC, FLAC, or OGG).
 */
const UPLOAD_CONSTRAINTS: Record<
  UploadCategoryName,
  {
    contentTypes: readonly string[];
    extensions: readonly string[];
    maxBytes: number;
  }
> = {
  audio: {
    contentTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'],
    extensions: ['.mp3', '.wav'],
    maxBytes: 25 * 1024 * 1024,
  },
  image: {
    contentTypes: [
      'image/gif',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ],
    extensions: ['.gif', '.jpeg', '.jpg', '.png', '.webp'],
    maxBytes: 10 * 1024 * 1024,
  },
  music: {
    contentTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'],
    extensions: ['.mp3', '.wav'],
    maxBytes: 25 * 1024 * 1024,
  },
  video: {
    contentTypes: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-msvideo',
    ],
    extensions: ['.avi', '.mov', '.mp4', '.webm'],
    maxBytes: 50 * 1024 * 1024,
  },
};

function readRequiredString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readUploadCategory(value: unknown): UploadCategoryName | undefined {
  if (value === undefined) {
    return 'image';
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return UPLOAD_CATEGORY_NAMES.find((name) => name === normalized);
}

function filenameExtension(filename: string): string | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    return undefined;
  }
  return filename.slice(dot).toLowerCase();
}

function toUploadUser(ctx: ToolExecutionContext): AuthenticatedUser {
  return {
    brandId: ctx.brandId ?? ctx.validatedScope?.brandId ?? '',
    id: ctx.userId,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  };
}

function toolFailure(error: string): AgentToolResult {
  return { creditsUsed: 0, error, success: false };
}

function readToolError(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.length > 0) {
      return body;
    }
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (typeof record.detail === 'string' && record.detail.length > 0) {
        return record.detail;
      }
      if (typeof record.message === 'string' && record.message.length > 0) {
        return record.message;
      }
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Media upload failed';
}

function readHostedUrl(ingredient: IngredientDocument): string | null {
  const record = ingredient as unknown as Record<string, unknown>;
  return typeof record.cdnUrl === 'string' && record.cdnUrl.length > 0
    ? record.cdnUrl
    : null;
}

function toCompletedMedia(
  ingredient: IngredientDocument,
  assetId: string,
): Array<{ assetId: string; kind?: string; order: number }> {
  const validated = resolvePublishValidationMedia(
    { category: ingredient.category },
    assetId,
  );
  if (validated.length === 0) {
    return [{ assetId, order: 0 }];
  }
  return validated.map((item, order) => ({
    assetId: item.id ?? assetId,
    kind: item.kind,
    order,
  }));
}

function readPostMedia(
  post: Record<string, unknown>,
): Array<{ assetId: string; kind?: string; order: number }> {
  if (!Array.isArray(post.ingredients)) {
    return [];
  }
  return post.ingredients.flatMap((item, order) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    const assetId = typeof record.id === 'string' ? record.id : '';
    if (!assetId) {
      return [];
    }
    const validated = resolvePublishValidationMedia(
      { category: record.category },
      assetId,
    );
    const kind = validated[0]?.kind;
    return [kind ? { assetId, kind, order } : { assetId, order }];
  });
}

function toListedPost(post: Record<string, unknown>): Record<string, unknown> {
  return {
    createdAt: post.createdAt ?? null,
    description: post.description ?? null,
    id: String(post.id),
    label: post.label ?? null,
    media: readPostMedia(post),
    platform: post.platform ?? null,
    publishedAt: post.publishedAt ?? null,
    scheduledDate: post.scheduledDate ?? null,
    state: post.targetExecutionState ?? null,
    status: post.status ?? null,
    targets: [
      {
        credentialId:
          typeof post.credentialId === 'string' ? post.credentialId : null,
        platform: post.platform ?? null,
        scheduledDate: post.scheduledDate ?? null,
        state: post.targetExecutionState ?? null,
        validationState: post.targetValidationState ?? null,
      },
    ],
    updatedAt: post.updatedAt ?? null,
  };
}
