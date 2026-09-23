import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { resolvePublishValidationMedia } from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import {
  categoryToPlural,
  IngredientCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import {
  serializeAgentBrand,
  serializeAgentBrands,
} from '@genfeedai/serializers';
import { HttpException, Inject, Injectable } from '@nestjs/common';

type AgentBrandsServiceLike = {
  findAll: (
    query: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<{ docs?: unknown[] }>;
  findOne: (query: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Workspace read tools: credits, brands, posts list, studio handoff.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentWorkspaceToolHandler {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly postsService: PostsService,
    private readonly personasService: PersonasService,
    private readonly presignedUploadService: PresignedUploadService,
  ) {}

  async getCreditsBalance(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        ctx.organizationId,
      );

    return {
      creditsUsed: 0,
      data: { balance },
      success: true,
    };
  }

  async listBrands(ctx: ToolExecutionContext): Promise<AgentToolResult> {
    const brands = await this.brandsService.findAll(
      {
        where: {
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
      },
      {},
    );

    return {
      creditsUsed: 0,
      data: {
        brands: serializeAgentBrands(
          (brands.docs as Record<string, unknown>[] | undefined) ?? [],
        ),
      },
      success: true,
    };
  }

  async listCharacters(
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
    // Prefer explicit thread/run scope over the user's selected-brand flag.
    // Agent turns always carry brandId in context when the URL/thread has one;
    // relying only on isSelected fails when that flag is false or stale.
    const scopedBrandId = ctx.brandId || ctx.validatedScope?.brandId;

    const currentBrand = scopedBrandId
      ? await this.brandsService.findOne({
          id: scopedBrandId,
          isDeleted: false,
          organizationId: ctx.organizationId,
        })
      : await this.brandsService.findOne({
          isDeleted: false,
          isSelected: true,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        });

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
      return toolFailure('get_post requires postId.');
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

    const uploadUser = toUploadUser(ctx);
    if (!uploadUser.brandId) {
      return toolFailure('Select a brand before requesting a media upload.');
    }

    try {
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
 * modal) plus the MIME types the presigned PUT signs.
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
    contentTypes: [
      'audio/aac',
      'audio/flac',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
    ],
    extensions: ['.aac', '.flac', '.mp3', '.ogg', '.wav'],
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
    contentTypes: [
      'audio/aac',
      'audio/flac',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
    ],
    extensions: ['.aac', '.flac', '.mp3', '.ogg', '.wav'],
    maxBytes: 25 * 1024 * 1024,
  },
  video: {
    contentTypes: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
      'video/x-msvideo',
    ],
    extensions: ['.avi', '.mkv', '.mov', '.mp4', '.webm'],
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
