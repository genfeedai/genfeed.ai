import { PersonasService } from '@api/collections/personas/services/personas.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { dispatchFundedSubmission } from '@api/collections/workflows/services/workflow-funded-dispatch.util';
import {
  type WorkflowLipSyncFunding,
  WorkflowLipSyncFundingService,
} from '@api/collections/workflows/services/workflow-lip-sync-funding.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { isReplicateSubmissionRejected } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { resolveAssetProcessingUrl } from '@api/services/media-urls/processing-media-url.util';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  type ExecutionContext,
  LipSyncExecutor,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, Optional } from '@nestjs/common';

const VIDEO_LIP_SYNC_MODELS = ['sync/lipsync-2', 'sync/lipsync-2-pro'];

type LipSyncResolverArgs = Parameters<
  Parameters<LipSyncExecutor['setResolver']>[0]
>;

/**
 * Registers the workflow lip-sync node. Every dispatch is funded first: the
 * output is bound to its hold before the provider sees the job, a definitive
 * rejection gives the hold back, and the provider callback settles it.
 */
@Injectable()
export class WorkflowLipSyncExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly funding: WorkflowLipSyncFundingService,
    @Optional() private readonly heyGenService?: HeyGenService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
    @Optional() private readonly personasService?: PersonasService,
  ) {}

  register(engine: WorkflowEngine): void {
    const executor = new LipSyncExecutor();
    executor.setResolver(
      async (mediaValue, audioValue, options, context, node) => {
        const { audio, isVideo, media, model, personaId } =
          await this.admitSources(
            mediaValue,
            audioValue,
            options,
            context,
            node,
          );
        const replicateService = this.replicateService;
        if (isVideo ? !replicateService : !this.heyGenService) {
          throw new Error('Selected lip-sync provider is unavailable');
        }
        const [mediaUrl, audioUrl] = await Promise.all([
          this.processingMediaUrl(context.organizationId, media),
          this.processingMediaUrl(context.organizationId, audio),
        ]);
        const fundingInput = {
          audioIngredientId: audio.id,
          brandId: media.brandId,
          organizationId: context.organizationId,
          userId: context.userId,
        };
        const funding = isVideo
          ? await this.funding.fundVideoLipSync({ ...fundingInput, model })
          : await this.funding.fundPhotoAnimation(fundingInput);
        try {
          const pending = await this.helper.createAndLinkProcessingOutput({
            output: {
              brandId: media.brandId,
              category: IngredientCategory.VIDEO,
              extension: MetadataExtension.MP4,
              model,
              organizationId: context.organizationId,
              userId: context.userId,
              parentIngredientId: media.id,
              personaId,
              references: [media.id, audio.id],
              transformations: [TransformationCategory.LIP_SYNCED],
            },
            continuation: {
              actionId: 'lipSync',
              context,
              isByok: funding.isByok,
              node,
              provider: isVideo ? 'replicate' : 'heygen',
            },
            resultUrl: (id) => this.helper.buildVideoIngredientUrl(id),
            runProvider: (id, continuationId) =>
              this.dispatchFunded(
                funding,
                { context, continuationId, ingredientId: id },
                () =>
                  isVideo && replicateService
                    ? replicateService.runModel(
                        model,
                        {
                          video: mediaUrl,
                          audio: audioUrl,
                          sync_mode: options.syncMode ?? 'silence',
                        },
                        funding.apiKey,
                        continuationId,
                      )
                    : this.requireHeyGen().generatePhotoAvatarVideo(
                        id,
                        mediaUrl,
                        audioUrl,
                        context.organizationId,
                        context.userId,
                        funding.apiKey,
                      ),
              ),
          });
          return {
            id: pending.ingredientId,
            status: IngredientStatus.PROCESSING,
            videoUrl: this.helper.buildVideoIngredientUrl(pending.ingredientId),
          };
        } finally {
          await funding.releasePool();
        }
      },
    );
    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }

  /**
   * Admits the source media, voice and character before anything is funded:
   * a foreign, unfinished or revoked source fails here.
   */
  private async admitSources(
    ...[mediaValue, audioValue, options, context, node]: LipSyncResolverArgs
  ) {
    if (!this.filesClientService)
      throw new Error('Media file service is unavailable');
    const media = await this.helper.requireMediaAsset(
      mediaValue,
      context.organizationId,
      [
        IngredientCategory.VIDEO,
        IngredientCategory.IMAGE,
        IngredientCategory.AVATAR,
      ],
    );
    const audio = await this.helper.requireMediaAsset(
      audioValue,
      context.organizationId,
      [
        IngredientCategory.MUSIC,
        IngredientCategory.VOICE,
        IngredientCategory.AUDIO,
      ],
    );
    const configuredBrandId = this.helper.readConfigString(
      node.config,
      'brandId',
    );
    if (configuredBrandId && configuredBrandId !== media.brandId) {
      throw new Error('Lip-sync brand must match the source asset brand');
    }
    if (audio.brandId !== media.brandId) {
      throw new Error(
        'Lip-sync source media and audio must belong to the same brand',
      );
    }
    // A character the brand can no longer use is refused before dispatch.
    const personaId = (
      await this.personasService?.resolveCharacterReferences({
        brandId: media.brandId,
        ingredientIds: [media.id],
        organizationId: context.organizationId,
        path: 'lip-sync',
      })
    )?.personaId;
    const isVideo = media.category === IngredientCategory.VIDEO;
    const mode = isVideo ? 'video' : 'image';
    if (options.mode && options.mode !== mode) {
      throw new Error('Lip-sync mode does not match the selected source asset');
    }
    const model =
      options.model ?? (isVideo ? 'sync/lipsync-2' : MODEL_KEYS.HEYGEN_AVATAR);
    if (
      isVideo
        ? !VIDEO_LIP_SYNC_MODELS.includes(model)
        : model !== MODEL_KEYS.HEYGEN_AVATAR
    ) {
      throw new Error(
        'Select a compatible lip-sync model for the source media',
      );
    }
    return { audio, isVideo, media, model, personaId };
  }

  private dispatchFunded<T>(
    funding: WorkflowLipSyncFunding,
    target: {
      context: ExecutionContext;
      continuationId: string;
      ingredientId: string;
    },
    submit: () => Promise<T>,
  ): Promise<T> {
    return dispatchFundedSubmission({
      failContinuation: (input) =>
        this.helper.failProviderContinuationSubmission(input),
      funding,
      isRejected: (error) =>
        error instanceof HeyGenSubmissionRejectedError ||
        isReplicateSubmissionRejected(error),
      submit,
      target,
    });
  }

  private requireHeyGen(): HeyGenService {
    if (!this.heyGenService) throw new Error('HeyGen is unavailable');
    return this.heyGenService;
  }

  private processingMediaUrl(
    organizationId: string,
    asset: {
      id: string;
      objectKey?: string;
      storageKey: string;
      storageType: string;
    },
  ): Promise<string> {
    return resolveAssetProcessingUrl(
      {
        authorizedMediaUrls: this.authorizedMediaUrls,
        configService: this.configService,
        filesClientService: this.filesClientService,
      },
      organizationId,
      asset,
    );
  }
}
