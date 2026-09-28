import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoQaContinuityResolverService } from '@api/collections/workflows/services/video-qa-continuity-resolver.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  CaptionFormat,
  CaptionLanguage,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  MusicSourceType,
  TransformationCategory,
} from '@genfeedai/contracts';
import {
  createVideoQaExecutor,
  createVideoStitchExecutor,
  type VideoStitchProcessorParams,
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, Optional } from '@nestjs/common';

/** Maps a workflow videoStitch step onto the stitch service. */
export function toWorkflowStitchRequest(
  params: VideoStitchProcessorParams,
  brandId: string,
  clipIds: string[],
): VideoStitchRequest {
  return {
    brandId,
    callerKind: 'workflow',
    clipIds,
    idempotencyKey: `workflow:${params.runId}:${params.nodeId}`,
    organizationId: params.organizationId,
    ...(params.parentId ? { parentId: params.parentId } : {}),
    ...(params.providerData ? { providerData: params.providerData } : {}),
    settings: {
      transition: params.transition,
      ...(params.transitionDuration !== undefined
        ? { transitionDuration: params.transitionDuration }
        : {}),
    },
    userId: params.userId,
  };
}

@Injectable()
export class WorkflowMediaProcessingExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly avatarVideoGenerationService?: AvatarVideoGenerationService,
    @Optional() private readonly captionsService?: CaptionsService,
    @Optional() private readonly fileQueueService?: FileQueueService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly ingredientsService?: IngredientsService,
    @Optional() private readonly metadataService?: MetadataService,
    @Optional() private readonly musicsService?: MusicsService,
    @Optional() private readonly sharedService?: SharedService,
    @Optional() private readonly whisperService?: WhisperService,
    @Optional()
    private readonly continuityResolver?: VideoQaContinuityResolverService,
    @Optional() private readonly videoStitchService?: VideoStitchService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerAvatarVideoExecutor(engine);
    this.registerCaptionsExecutor(engine);
    this.registerMusicSourceExecutor(engine);
    this.registerSoundOverlayExecutor(engine);
    this.registerVideoFrameExtractExecutor(engine);
    this.registerVideoQaExecutor(engine);
    this.registerVideoStitchExecutor(engine);
    this.registerDirectMediaInputExecutors(engine);
  }

  private registerDirectMediaInputExecutors(engine: WorkflowEngine): void {
    engine.registerExecutor('input-image', async (node) =>
      this.helper.resolveConfiguredMediaInput(node, 'image'),
    );
    engine.registerExecutor('input-video', async (node) =>
      this.helper.resolveConfiguredMediaInput(node, 'video'),
    );
  }

  private registerAvatarVideoExecutor(engine: WorkflowEngine): void {
    const avatarVideoGenerationService = this.avatarVideoGenerationService;

    if (!avatarVideoGenerationService) {
      return;
    }

    engine.registerExecutor('aiAvatarVideo', async (node, inputs, context) => {
      const script = this.helper.getRequiredStringInput(inputs, 'script');
      let continuationId: string | undefined;
      let result: Awaited<
        ReturnType<AvatarVideoGenerationService['generateAvatarVideo']>
      >;
      try {
        result = await avatarVideoGenerationService.generateAvatarVideo(
          {
            aspectRatio: this.helper.getAspectRatioConfig(
              node.config.aspectRatio,
            ),
            audioUrl: this.helper.getOptionalStringInput(inputs, 'audioUrl'),
            clonedVoiceId: this.helper.getOptionalStringInput(
              inputs,
              'clonedVoiceId',
            ),
            photoUrl: this.helper.getOptionalStringInput(inputs, 'photoUrl'),
            text: script,
            useIdentity:
              node.config.useIdentityDefaults === undefined
                ? true
                : Boolean(node.config.useIdentityDefaults),
          },
          {
            brandId: this.helper.readConfigString(node.config, 'brandId'),
            organizationId: context.organizationId,
            userId: context.userId,
          },
          async (ingredientId) => {
            const continuation = await this.helper.createProviderContinuation({
              actionId: 'aiAvatarVideo',
              context,
              ingredientId,
              node,
              provider: 'heygen',
            });
            continuationId = continuation.continuationId;
          },
        );
        if (!continuationId) {
          throw new Error(
            'Avatar provider submitted without a durable workflow continuation',
          );
        }
        await this.helper.markProviderContinuationSubmitted({
          continuationId,
          externalId: result.externalId,
          organizationId: context.organizationId,
        });
      } catch (error: unknown) {
        if (continuationId) {
          await this.helper.failProviderContinuationSubmission({
            continuationId,
            error: error instanceof Error ? error.message : String(error),
            organizationId: context.organizationId,
          });
        }
        throw error;
      }

      return {
        externalId: result.externalId,
        id: result.ingredientId,
        status: result.status,
        video: {
          externalId: result.externalId,
          id: result.ingredientId,
          status: result.status,
        },
      };
    });
  }

  private registerCaptionsExecutor(engine: WorkflowEngine): void {
    const captionsService = this.captionsService;
    const fileQueueService = this.fileQueueService;
    const filesClientService = this.filesClientService;
    const ingredientsService = this.ingredientsService;
    const metadataService = this.metadataService;
    const sharedService = this.sharedService;
    const whisperService = this.whisperService;

    if (
      !captionsService ||
      !fileQueueService ||
      !filesClientService ||
      !ingredientsService ||
      !metadataService ||
      !sharedService ||
      !whisperService
    ) {
      return;
    }

    engine.registerExecutor(
      'effect-captions',
      async (node, inputs, context) => {
        const brandId = this.helper.getRequiredBrandId(node);
        const sourceVideo = this.helper.getVideoResultInput(inputs, 'video');
        const sourceIngredientId = this.helper.extractIngredientId(sourceVideo);

        if (!sourceIngredientId) {
          throw new Error(
            'effect-captions requires a source video ingredient id',
          );
        }

        const captionContent =
          await whisperService.generateCaptions(sourceIngredientId);

        const captionInput = {
          content: captionContent,
          format: CaptionFormat.SRT,
          ingredientId: sourceIngredientId,
          isDeleted: false,
          language: CaptionLanguage.EN,
          organizationId: context.organizationId,
          userId: context.userId,
        };
        await captionsService.create(captionInput);

        const { ingredientData, metadataData } =
          await sharedService.createMediaDocumentsInternal({
            brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            organizationId: context.organizationId,
            parentId: sourceIngredientId,
            status: IngredientStatus.PROCESSING,
            userId: context.userId,
          });

        const ingredientId = ingredientData.id.toString();
        const job = await fileQueueService.processVideo({
          ingredientId,
          organizationId: context.organizationId,
          params: {
            captionContent,
            inputPath: `${this.configService.ingredientsEndpoint}/videos/${sourceIngredientId}`,
          },
          room: getUserRoomName(context.userId),
          type: 'add-captions',
          userId: context.userId,
          websocketUrl: `/videos/${ingredientId}`,
        });

        const result = await fileQueueService.waitForJob(job.jobId, 180_000);
        const outputPath = this.helper.getRequiredJobOutputPath(result);
        const uploaded = await filesClientService.uploadToS3(
          ingredientId,
          'videos',
          {
            path: outputPath,
            type: FileInputType.FILE,
          },
        );

        await ingredientsService.patch(ingredientId, {
          status: IngredientStatus.GENERATED,
          transformations: [TransformationCategory.CAPTIONED],
        });
        await metadataService.patch(
          metadataData.id,
          new MetadataEntity(uploaded),
        );

        return {
          id: ingredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.helper.buildVideoIngredientUrl(ingredientId),
        };
      },
    );
  }

  private registerMusicSourceExecutor(engine: WorkflowEngine): void {
    const musicsService = this.musicsService;

    if (!musicsService) {
      return;
    }

    engine.registerExecutor('musicSource', async (node, inputs, context) => {
      const sourceType =
        (node.config.sourceType as MusicSourceType | undefined) ??
        MusicSourceType.LIBRARY;

      if (sourceType !== MusicSourceType.LIBRARY) {
        const uploadedUrl = this.helper.getOptionalStringInput(
          inputs,
          'uploadUrl',
        );
        const generatedPrompt = this.helper.getOptionalStringInput(
          inputs,
          'generatePrompt',
        );

        return {
          musicUrl: uploadedUrl ?? generatedPrompt ?? null,
          sourceType,
        };
      }

      const brandId = this.helper.getRequiredBrandId(node);
      const music =
        (await musicsService.findOne({
          brandId: brandId,
          organizationId: context.organizationId,
          status: IngredientStatus.GENERATED,
        })) ??
        (await musicsService.findOne({
          organizationId: context.organizationId,
          status: IngredientStatus.GENERATED,
        }));
      const musicId = this.helper.getDocumentId(music);

      if (!music || !musicId) {
        throw new Error(
          'No generated music is available for this organization',
        );
      }

      return {
        musicIngredientId: musicId,
        musicUrl: this.helper.buildMusicIngredientUrl(musicId),
        sourceType,
      };
    });
  }

  private registerSoundOverlayExecutor(engine: WorkflowEngine): void {
    const files = this.filesClientService;
    if (!files) return;
    engine.registerExecutor('soundOverlay', async (node, inputs, context) => {
      const video = await this.helper.requireMediaAsset(
        inputs.get('videoUrl'),
        context.organizationId,
        [IngredientCategory.VIDEO],
      );
      const soundInput = inputs.get('soundUrl');
      const sound = await this.helper.requireMediaAsset(
        this.helper.extractMusicIngredientId(soundInput) ?? soundInput,
        context.organizationId,
        [
          IngredientCategory.MUSIC,
          IngredientCategory.VOICE,
          IngredientCategory.AUDIO,
        ],
      );
      const brandId =
        this.helper.readConfigString(node.config, 'brandId') ?? video.brandId;
      if (brandId !== video.brandId)
        throw new Error('Soundtrack brand must match the source video');
      if (sound.brandId !== video.brandId)
        throw new Error('Soundtrack brand must match the source video');
      const mixMode = node.config.mixMode ?? 'replace';
      if (
        mixMode !== 'replace' &&
        mixMode !== 'mix' &&
        mixMode !== 'background'
      ) {
        throw new Error('Soundtrack mode must be replace, mix, or background');
      }
      const pending = await this.helper.createWorkflowOutputIngredient({
        brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organizationId: context.organizationId,
        userId: context.userId,
        parentIngredientId: video.id,
        references: [video.id, sound.id],
      });
      try {
        const [videoUrl, audioUrl] = await Promise.all([
          files.getPresignedDownloadUrl(video.storageKey, video.storageType),
          files.getPresignedDownloadUrl(sound.storageKey, sound.storageType),
        ]);
        const result = await files.audioOverlay({
          videoUrl,
          audioUrl,
          mixMode,
          audioVolume: this.helper.getOptionalNumberConfig(
            node.config,
            'audioVolume',
            100,
          ),
          videoVolume: this.helper.getOptionalNumberConfig(
            node.config,
            'videoVolume',
            mixMode === 'replace' ? 0 : 100,
          ),
          fadeIn: this.helper.getOptionalNumberConfig(node.config, 'fadeIn', 0),
          fadeOut: this.helper.getOptionalNumberConfig(
            node.config,
            'fadeOut',
            0,
          ),
          outputKey: `${pending.ingredientId}.mp4`,
        });
        await this.helper.patchMetadata(
          pending.metadataId,
          new MetadataEntity({
            duration: result.duration,
            publicUrl: result.publicUrl,
            s3Key: result.s3Key,
          }),
        );
        await this.helper.patchIngredient(pending.ingredientId, {
          status: IngredientStatus.GENERATED,
          s3Key: result.s3Key,
        });
        return {
          id: pending.ingredientId,
          status: IngredientStatus.GENERATED,
          videoUrl: this.helper.buildVideoIngredientUrl(pending.ingredientId),
        };
      } catch (error) {
        await this.helper.patchIngredient(pending.ingredientId, {
          status: IngredientStatus.FAILED,
        });
        throw error;
      }
    });
  }

  private registerVideoQaExecutor(engine: WorkflowEngine): void {
    const filesClientService = this.filesClientService;

    if (!filesClientService) {
      return;
    }
    const continuityResolver = this.continuityResolver;

    const executor = createVideoQaExecutor(
      async (params) =>
        filesClientService.inspectVideoQa({
          blackDurationSeconds: params.blackDurationSeconds,
          freezeDurationSeconds: params.freezeDurationSeconds,
          isContactSheetEnabled: params.isContactSheetEnabled,
          videoUrl: params.videoUrl,
        }),
      continuityResolver
        ? async (params) => {
            const characterReferenceUrls =
              await this.resolveContinuityReferenceUrls(
                params.characterReferenceUrls,
                params.organizationId,
              );
            const productReferenceUrls =
              await this.resolveContinuityReferenceUrls(
                params.productReferenceUrls,
                params.organizationId,
              );
            if (
              characterReferenceUrls.length === 0 &&
              productReferenceUrls.length === 0
            ) {
              return { skipReason: 'canonical_references_unavailable' };
            }
            return continuityResolver.resolve({
              ...params,
              characterReferenceUrls,
              productReferenceUrls,
            });
          }
        : undefined,
    );

    engine.registerExecutor(
      'videoQa',
      this.helper.wrapEngineExecutor(executor),
    );
  }

  /**
   * Continuity QA compares pixels, so ingredient ids must become reachable
   * image URLs. Already-absolute URLs pass through; unresolvable ids are
   * dropped so the executor can skip with canonical_references_unavailable
   * instead of inventing a pass.
   */
  private async resolveContinuityReferenceUrls(
    values: readonly string[],
    organizationId: string,
  ): Promise<string[]> {
    const filesClientService = this.filesClientService;
    const resolved: string[] = [];

    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        resolved.push(trimmed);
        continue;
      }
      try {
        const asset = await this.helper.requireMediaAsset(
          trimmed,
          organizationId,
          [IngredientCategory.IMAGE, IngredientCategory.AVATAR],
        );
        if (!filesClientService) {
          resolved.push(
            this.helper.buildMediaIngredientUrl(asset.id, asset.category),
          );
          continue;
        }
        resolved.push(
          await filesClientService.getPresignedDownloadUrl(
            asset.storageKey,
            asset.storageType,
          ),
        );
      } catch {
        // Omit the ref; empty results skip rather than fake consistent.
      }
    }

    return resolved;
  }

  private registerVideoFrameExtractExecutor(engine: WorkflowEngine): void {
    const filesClientService = this.filesClientService;
    if (!filesClientService) {
      return;
    }

    engine.registerExecutor('videoFrameExtract', async (_node, inputs) => {
      const source = inputs.get('video');
      const videoUrl = this.helper.extractMediaUrl(source);
      const ingredientId = this.helper.extractIngredientId(source);
      if (!videoUrl || !ingredientId) {
        throw new Error(
          'videoFrameExtract requires a source video ingredient URL',
        );
      }

      const providerVideoUrl = await filesClientService.getPresignedDownloadUrl(
        ingredientId,
        'videos',
      );

      const metadata =
        await filesClientService.extractMetadataFromUrl(providerVideoUrl);
      if (
        typeof metadata.duration !== 'number' ||
        !Number.isFinite(metadata.duration) ||
        metadata.duration <= 0
      ) {
        throw new Error(
          'videoFrameExtract requires a source video with a readable duration',
        );
      }
      const selectionMode = this.helper.readConfigString(
        _node.config,
        'selectionMode',
      );
      const requestedTimestamp = this.helper.getOptionalNumberConfig(
        _node.config,
        'timestampSeconds',
        0,
      );
      const timestamp =
        selectionMode === 'last'
          ? Math.max(0, metadata.duration - 0.05)
          : requestedTimestamp;
      const frameUrl = await filesClientService.generateThumbnail(
        providerVideoUrl,
        ingredientId,
        timestamp,
      );

      return {
        image: frameUrl,
        last_frame: frameUrl,
        sourceVideo: videoUrl,
      };
    });
  }

  private registerVideoStitchExecutor(engine: WorkflowEngine): void {
    const videoStitchService = this.videoStitchService;
    if (!videoStitchService) {
      return;
    }

    const executor = createVideoStitchExecutor(async (params) => {
      const brandId = await this.helper.resolveBrandIdFromInputOrFail(
        params.brandId,
        params.videoUrls[0],
        'videoStitch',
        params.organizationId,
      );
      const request = toWorkflowStitchRequest(
        params,
        brandId,
        params.videoUrls.map((videoUrl) =>
          this.helper.requireMediaAssetId(videoUrl),
        ),
      );

      // A node retry inside the same run reuses the output; a failed one is
      // requeued rather than failing the retry immediately.
      let handle = await videoStitchService.stitch(request);
      if (handle.state === 'failed') {
        handle = await videoStitchService.retry(request, handle);
      }
      const outcome = await videoStitchService.waitForCompletion(handle);
      if (outcome.state !== 'generated') {
        throw new Error(outcome.error ?? 'Video stitch did not complete');
      }

      return {
        jobId: handle.jobId,
        outputVideoUrl: this.helper.buildVideoIngredientUrl(handle.outputId),
      };
    });

    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }
}
