import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
import { VideoQaContinuityResolverService } from '@api/collections/workflows/services/video-qa-continuity-resolver.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
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
  type WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { Injectable, Optional } from '@nestjs/common';

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
    @Optional()
    private readonly videoMusicOrchestrationService?: VideoMusicOrchestrationService,
    @Optional() private readonly whisperService?: WhisperService,
    @Optional()
    private readonly continuityResolver?: VideoQaContinuityResolverService,
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
    const videoMusicOrchestrationService = this.videoMusicOrchestrationService;

    if (!videoMusicOrchestrationService) {
      return;
    }

    engine.registerExecutor('soundOverlay', async (node, inputs, context) => {
      const brandId = this.helper.getRequiredBrandId(node);
      const sourceVideo = this.helper.getVideoResultInput(inputs, 'videoUrl');
      const videoIngredientId = this.helper.extractIngredientId(sourceVideo);

      if (!videoIngredientId) {
        throw new Error('soundOverlay requires a source video ingredient id');
      }

      const soundSource = inputs.get('soundUrl');
      const musicIngredientId =
        this.helper.extractMusicIngredientId(soundSource);

      if (!musicIngredientId) {
        throw new Error(
          'soundOverlay requires a library music ingredient from musicSource',
        );
      }

      const mergedIngredientId =
        await videoMusicOrchestrationService.mergeVideoWithMusic(
          videoIngredientId,
          musicIngredientId,
          this.helper.getOptionalNumberConfig(node.config, 'audioVolume', 30),
          false,
          {
            brandId,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );

      return {
        id: mergedIngredientId,
        status: IngredientStatus.GENERATED,
        videoUrl: this.helper.buildVideoIngredientUrl(mergedIngredientId),
      };
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
        ? (params) => continuityResolver.resolve(params)
        : undefined,
    );

    engine.registerExecutor(
      'videoQa',
      this.helper.wrapEngineExecutor(executor),
    );
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
    const fileQueueService = this.fileQueueService;
    const filesClientService = this.filesClientService;
    const ingredientsService = this.ingredientsService;
    const metadataService = this.metadataService;
    const sharedService = this.sharedService;

    if (
      !fileQueueService ||
      !filesClientService ||
      !ingredientsService ||
      !metadataService ||
      !sharedService
    ) {
      return;
    }

    const executor = createVideoStitchExecutor(async (params) => {
      const brandId = await this.helper.resolveBrandIdFromInputOrFail(
        params.brandId,
        params.videoUrls[0],
        'videoStitch',
        params.organizationId,
      );
      const sourceIds = params.videoUrls
        .map((videoUrl) => this.helper.extractIngredientId(videoUrl))
        .filter((id): id is string => typeof id === 'string');

      if (sourceIds.length < 2) {
        throw new Error(
          'videoStitch requires at least 2 source video ingredient ids',
        );
      }

      const { ingredientData, metadataData } =
        await sharedService.createMediaDocumentsInternal({
          brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organizationId: params.organizationId,
          parentId: params.parentId,
          providerData: params.providerData,
          sourceIds,
          status: IngredientStatus.PROCESSING,
          userId: params.userId,
        });

      const ingredientId = ingredientData.id.toString();
      try {
        const job = await fileQueueService.processVideo({
          ingredientId,
          organizationId: params.organizationId,
          params: {
            sourceIds,
            transition: params.transitionType,
            transitionDuration: params.transitionDuration,
          },
          room: getUserRoomName(params.userId),
          type: 'merge-videos',
          userId: params.userId,
          websocketUrl: `/videos/${ingredientId}`,
        });

        const result = await fileQueueService.waitForJob(job.jobId, 300_000);
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
          transformations: [TransformationCategory.MERGED],
        });
        await metadataService.patch(
          metadataData.id,
          new MetadataEntity(uploaded),
        );

        return {
          jobId: job.jobId,
          outputVideoUrl: this.helper.buildVideoIngredientUrl(ingredientId),
        };
      } catch (error: unknown) {
        try {
          await ingredientsService.patch(ingredientId, {
            status: IngredientStatus.FAILED,
          });
        } catch {
          // Preserve the processing failure that caused the workflow node to fail.
        }
        throw error;
      }
    });

    engine.registerExecutor(
      executor.nodeType,
      this.helper.wrapEngineExecutor(executor),
    );
  }
}
