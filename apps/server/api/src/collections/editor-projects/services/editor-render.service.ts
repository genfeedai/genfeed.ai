import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import {
  buildValidatedEditorExportContract,
  EditorExportContractValidationError,
} from '@api/collections/editor-projects/utils/editor-export-contract.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  EditorTrackType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import {
  EDITOR_RENDERER_VERSION,
  type IEditorExportAssetReference,
  type IEditorRenderJobParams,
  type IEditorRenderOutputMetadata,
  type IValidatedEditorExportContract,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';

interface RenderResult {
  jobId: string;
  projectId: string;
  status: string;
}

interface TrustedRenderContract {
  brandId?: string;
  contract: IEditorRenderJobParams;
}

const ALLOWED_ASSET_CATEGORIES: Record<
  Exclude<EditorTrackType, EditorTrackType.TEXT>,
  ReadonlySet<string>
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

@Injectable()
export class EditorRenderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly editorProjectsService: EditorProjectsService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

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

    await this.editorProjectsService.markAsRendering(id, orgId, {
      ...contract,
      queuedAt: new Date().toISOString(),
    });

    let outputIngredientId: string | undefined;

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
      const jobResponse = await this.fileQueueService.processVideo({
        authProviderUserId: user.id,
        ingredientId,
        organizationId: orgId,
        params: contract,
        room: getUserRoomName(user.id),
        type: 'render-editor-composition',
        userId: publicMetadata.user,
        websocketUrl: `/videos/${ingredientId}`,
      });

      this.handleAsyncCompletion(
        id,
        ingredientId,
        metadataData.id.toString(),
        jobResponse.jobId,
        user,
      );

      return {
        jobId: jobResponse.jobId,
        projectId: id,
        status: 'rendering',
      };
    } catch (error: unknown) {
      await Promise.all([
        this.editorProjectsService.markAsFailed(id),
        ...(outputIngredientId
          ? [
              this.ingredientsService.patch(outputIngredientId, {
                status: IngredientStatus.FAILED,
              }),
            ]
          : []),
      ]);
      throw error;
    }
  }

  private async authorizeAndTrustAssets(
    validatedContract: IValidatedEditorExportContract,
    organizationId: string,
  ): Promise<TrustedRenderContract> {
    const trustedUrlByClipId = new Map<string, string>();
    let brandId: string | undefined;

    for (const asset of validatedContract.assetManifest) {
      const ingredient = await this.ingredientsService.findOne({
        id: asset.ingredientId,
        isDeleted: false,
        organizationId,
      });

      if (!ingredient) {
        throw new NotFoundException('Source asset');
      }

      const category = String(ingredient.category)
        .toLowerCase()
        .replaceAll('_', '-');
      if (!ALLOWED_ASSET_CATEGORIES[asset.type].has(category)) {
        throw new UnprocessableEntityException(
          `Asset ${asset.ingredientId} is not valid for a ${asset.type} track.`,
        );
      }

      trustedUrlByClipId.set(
        asset.clipId,
        `${this.configService.ingredientsEndpoint}/${category}s/${asset.ingredientId}`,
      );

      if (asset.type === EditorTrackType.VIDEO && !brandId) {
        const ingredientBrand = ingredient.brandId ?? ingredient.brand;
        if (typeof ingredientBrand === 'string') {
          brandId = ingredientBrand;
        }
      }
    }

    const trustAsset = (
      asset: IEditorExportAssetReference,
    ): IEditorExportAssetReference => ({
      ...asset,
      ingredientUrl:
        trustedUrlByClipId.get(asset.clipId) ?? asset.ingredientUrl,
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
            clips: track.clips.map((clip) => ({
              ...clip,
              ingredientUrl:
                trustedUrlByClipId.get(clip.id) ?? clip.ingredientUrl,
            })),
          })),
        },
      },
    };
  }

  private handleAsyncCompletion(
    projectId: string,
    ingredientId: string,
    metadataId: string,
    jobId: string,
    user: User,
  ): void {
    this.fileQueueService
      .waitForJob(jobId, 900000)
      .then(async (result) => {
        const output = this.readOutputMetadata(result);

        await this.metadataService.patch(metadataId, {
          duration: output.durationSeconds,
          height: output.height,
          label: 'Editor Render',
          size: output.size,
          width: output.width,
        });

        await this.ingredientsService.patch(ingredientId, {
          status: IngredientStatus.GENERATED,
        });

        await this.editorProjectsService.markAsCompleted(
          projectId,
          ingredientId,
          output,
        );

        await this.websocketService.publishVideoComplete(
          WebSocketPaths.video(ingredientId),
          {
            eventType: WebSocketEventType.VIDEO_GENERATED,
            id: ingredientId,
            status: WebSocketEventStatus.COMPLETED,
          },
          user.id,
          getUserRoomName(user.id),
        );
      })
      .catch(async (error: unknown) => {
        this.loggerService.error('Editor project render failed', error);

        await Promise.all([
          this.editorProjectsService.markAsFailed(projectId),
          this.ingredientsService.patch(ingredientId, {
            status: IngredientStatus.FAILED,
          }),
        ]);

        await this.websocketService.publishMediaFailed(
          WebSocketPaths.video(ingredientId),
          'Failed to render project. Please try again.',
          user.id,
          getUserRoomName(user.id),
        );
      });
  }

  private readOutputMetadata(result: unknown): IEditorRenderOutputMetadata {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Editor renderer returned an invalid result.');
    }

    const output = result as Record<string, unknown>;
    const requiredNumbers = [
      'durationFrames',
      'durationSeconds',
      'fps',
      'height',
      'size',
      'width',
    ] as const;
    const requiredStrings = ['s3Key', 'url'] as const;

    if (
      output.rendererVersion !== EDITOR_RENDERER_VERSION ||
      requiredNumbers.some(
        (key) =>
          typeof output[key] !== 'number' ||
          !Number.isFinite(output[key] as number),
      ) ||
      requiredStrings.some((key) => typeof output[key] !== 'string')
    ) {
      throw new Error('Editor renderer returned incomplete output metadata.');
    }

    return {
      durationFrames: output.durationFrames as number,
      durationSeconds: output.durationSeconds as number,
      fps: output.fps as number,
      height: output.height as number,
      rendererVersion: EDITOR_RENDERER_VERSION,
      s3Key: output.s3Key as string,
      size: output.size as number,
      url: output.url as string,
      width: output.width as number,
    };
  }
}
