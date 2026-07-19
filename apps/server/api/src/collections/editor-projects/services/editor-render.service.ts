import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import {
  buildValidatedEditorExportContract,
  EditorExportContractValidationError,
} from '@api/collections/editor-projects/utils/editor-export-contract.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  EditorProjectStatus,
  EditorTrackType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import {
  EDITOR_RENDERER_VERSION,
  type IEditorExportAssetReference,
  type IEditorRenderCorrelation,
  type IEditorRenderJobParams,
  type IValidatedEditorExportContract,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

type RenderIngredientCategory =
  | IngredientCategory.AUDIO
  | IngredientCategory.AVATAR
  | IngredientCategory.MUSIC
  | IngredientCategory.VIDEO
  | IngredientCategory.VIDEO_EDIT
  | IngredientCategory.VOICE;

interface RenderResult {
  jobId: string;
  projectId: string;
  status: string;
}

interface CancelRenderResult {
  jobId: string;
  projectId: string;
  status: 'cancelled';
}

interface TrustedRenderContract {
  brandId?: string;
  contract: IEditorRenderJobParams;
}

const ALLOWED_ASSET_CATEGORIES: Record<
  Exclude<EditorTrackType, EditorTrackType.TEXT>,
  ReadonlySet<RenderIngredientCategory>
> = {
  [EditorTrackType.AUDIO]: new Set([
    IngredientCategory.AUDIO,
    IngredientCategory.MUSIC,
    IngredientCategory.VOICE,
  ]),
  [EditorTrackType.VIDEO]: new Set([
    IngredientCategory.AVATAR,
    IngredientCategory.VIDEO,
    IngredientCategory.VIDEO_EDIT,
  ]),
};

const INGREDIENT_CATEGORY_PATHS: Readonly<
  Record<RenderIngredientCategory, string>
> = {
  [IngredientCategory.AUDIO]: 'audios',
  [IngredientCategory.AVATAR]: 'avatars',
  [IngredientCategory.MUSIC]: 'musics',
  [IngredientCategory.VIDEO]: 'videos',
  [IngredientCategory.VIDEO_EDIT]: 'video-edits',
  [IngredientCategory.VOICE]: 'voices',
};

function isRenderIngredientCategory(
  category: IngredientCategory,
): category is RenderIngredientCategory {
  return category in INGREDIENT_CATEGORY_PATHS;
}

@Injectable()
export class EditorRenderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly notificationsPublisher: NotificationsPublisherService,
    private readonly sharedService: SharedService,
  ) {}

  async cancel(id: string, orgId: string): Promise<CancelRenderResult> {
    const project = await this.editorProjectsService.findForRender(id, orgId);
    const renderJob =
      this.editorProjectsService.readRenderProvenance(project)?.job;
    if (!renderJob) {
      throw new UnprocessableEntityException(
        'Project does not have an active render job.',
      );
    }

    await this.fileQueueService.cancelEditorRender(renderJob.jobId);
    const failure = {
      attempt: 0,
      failedAt: new Date().toISOString(),
      reason: 'cancelled' as const,
    };
    const result: CancelRenderResult = {
      jobId: renderJob.jobId,
      projectId: id,
      status: 'cancelled',
    };
    try {
      await this.editorProjectsService.markAsCancelled(
        id,
        renderJob.jobId,
        failure,
      );
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }
      const current = await this.editorProjectsService.findForRender(id, orgId);
      if (
        this.editorProjectsService.readStatus(current) !==
        EditorProjectStatus.CANCELLED
      ) {
        throw error;
      }
      return result;
    }
    await this.ingredientsService.patch(renderJob.ingredientId, {
      status: IngredientStatus.FAILED,
    });
    await this.notificationsPublisher.publishMediaFailed(
      WebSocketPaths.video(renderJob.ingredientId),
      'The render was cancelled.',
      renderJob.authProviderUserId,
      renderJob.room,
    );

    return result;
  }

  async render(id: string, orgId: string, user: User): Promise<RenderResult> {
    const publicMetadata = user.publicMetadata as Record<string, string>;
    const projectForValidation = await this.editorProjectsService.findForRender(
      id,
      orgId,
    );
    let validatedContract: IValidatedEditorExportContract;

    try {
      validatedContract =
        buildValidatedEditorExportContract(projectForValidation);
    } catch (error: unknown) {
      if (error instanceof EditorExportContractValidationError) {
        throw new UnprocessableEntityException({
          code: 'editor_export_contract_invalid',
          message: error.message,
          violations: error.violations,
        });
      }
      throw error;
    }

    const { brandId, contract } = await this.authorizeAndTrustAssets(
      validatedContract,
      orgId,
    );

    const jobId = randomUUID();
    const room = getUserRoomName(user.id);
    await this.editorProjectsService.markAsRendering(id, orgId, {
      ...contract,
      queuedAt: new Date().toISOString(),
    });

    let outputIngredientId: string | undefined;
    let renderJob: IEditorRenderCorrelation | undefined;

    try {
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          height: contract.snapshot.settings.height,
          organizationId: orgId,
          parentId: contract.assetManifest.find(
            (asset) => asset.type === EditorTrackType.VIDEO,
          )?.ingredientId,
          status: IngredientStatus.PROCESSING,
          width: contract.snapshot.settings.width,
        });

      const ingredientId = ingredientData.id.toString();
      outputIngredientId = ingredientId;
      renderJob = {
        authProviderUserId: user.id,
        ingredientId,
        jobId,
        metadataId: metadataData.id.toString(),
        projectId: id,
        room,
      };
      await this.editorProjectsService.attachRenderJob(id, renderJob);

      const jobResponse = await this.fileQueueService.processVideo({
        authProviderUserId: user.id,
        id: jobId,
        ingredientId,
        organizationId: orgId,
        params: { ...contract, editorRender: renderJob },
        room,
        type: 'render-editor-composition',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientId}`,
      });

      if (jobResponse.jobId !== jobId) {
        throw new Error('Files service returned an unexpected render job ID.');
      }

      return {
        jobId,
        projectId: id,
        status: 'rendering',
      };
    } catch (error: unknown) {
      const cleanupResults = await Promise.allSettled([
        this.editorProjectsService.markAsFailed(id, renderJob?.jobId),
        ...(outputIngredientId
          ? [
              this.ingredientsService.patch(outputIngredientId, {
                status: IngredientStatus.FAILED,
              }),
            ]
          : []),
      ]);
      for (const cleanupResult of cleanupResults) {
        if (cleanupResult.status === 'rejected') {
          // Preserve the queueing error; cleanup failures are secondary.
          this.loggerService.error(
            'Failed to clean up editor render state',
            cleanupResult.reason,
          );
        }
      }
      throw error;
    }
  }

  private async authorizeAndTrustAssets(
    validatedContract: IValidatedEditorExportContract,
    organizationId: string,
  ): Promise<TrustedRenderContract> {
    const assetIds = Array.from(
      new Set(
        validatedContract.assetManifest.map((asset) => asset.ingredientId),
      ),
    );
    const result = await this.ingredientsService.findAll(
      {
        where: {
          _id: { in: assetIds },
          isDeleted: false,
          organization: organizationId,
        },
      },
      { pagination: false },
      false,
    );
    const ingredientById = new Map(
      result.docs.map((ingredient) => [ingredient.id.toString(), ingredient]),
    );
    const trustedUrlByClipId = new Map<string, string>();
    let brandId: string | undefined;

    for (const asset of validatedContract.assetManifest) {
      const ingredient = ingredientById.get(asset.ingredientId);

      if (!ingredient) {
        throw new NotFoundException('Source asset');
      }

      const category = String(ingredient.category)
        .toLowerCase()
        .replaceAll('_', '-') as IngredientCategory;
      if (
        !isRenderIngredientCategory(category) ||
        !ALLOWED_ASSET_CATEGORIES[asset.type].has(category)
      ) {
        throw new UnprocessableEntityException(
          `Asset ${asset.ingredientId} is not valid for a ${asset.type} track.`,
        );
      }

      trustedUrlByClipId.set(
        asset.clipId,
        `${this.configService.ingredientsEndpoint}/${INGREDIENT_CATEGORY_PATHS[category]}/${asset.ingredientId}`,
      );

      if (asset.type === EditorTrackType.VIDEO && !brandId) {
        const ingredientBrand = ingredient.brandId ?? ingredient.brand;
        if (typeof ingredientBrand === 'string') {
          brandId = ingredientBrand;
        }
      }
    }

    const trustedUrl = (clipId: string): string => {
      const url = trustedUrlByClipId.get(clipId);
      if (!url) {
        throw new UnprocessableEntityException(
          `Asset URL for clip ${clipId} could not be trusted.`,
        );
      }
      return url;
    };
    const trustAsset = (
      asset: IEditorExportAssetReference,
    ): IEditorExportAssetReference => ({
      ...asset,
      ingredientUrl: trustedUrl(asset.clipId),
    });

    return {
      brandId,
      contract: {
        assetManifest: validatedContract.assetManifest.map(trustAsset),
        rendererVersion: EDITOR_RENDERER_VERSION,
        snapshot: {
          ...validatedContract.snapshot,
          tracks: validatedContract.snapshot.tracks.map((track) => ({
            ...track,
            clips:
              track.type === EditorTrackType.TEXT
                ? track.clips.map((clip) => ({
                    ...clip,
                    ingredientId: '',
                    ingredientUrl: '',
                  }))
                : track.clips.map((clip) => ({
                    ...clip,
                    ingredientUrl: trustedUrl(clip.id),
                  })),
          })),
        },
      },
    };
  }
}
