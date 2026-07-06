import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoMusicOrchestrationService } from '@api/collections/videos/services/video-music-orchestration.service';
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
} from '@genfeedai/enums';
import type { WorkflowEngine } from '@genfeedai/workflow-engine';
import { ConfigService } from '@libs/config/config.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';

export class WorkflowMediaProcessingExecutorRegistrarService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly configService: ConfigService,
    private readonly avatarVideoGenerationService?: AvatarVideoGenerationService,
    private readonly captionsService?: CaptionsService,
    private readonly fileQueueService?: FileQueueService,
    private readonly filesClientService?: FilesClientService,
    private readonly ingredientsService?: IngredientsService,
    private readonly metadataService?: MetadataService,
    private readonly musicsService?: MusicsService,
    private readonly sharedService?: SharedService,
    private readonly videoMusicOrchestrationService?: VideoMusicOrchestrationService,
    private readonly whisperService?: WhisperService,
  ) {}

  register(engine: WorkflowEngine): void {
    this.registerAvatarVideoExecutor(engine);
    this.registerCaptionsExecutor(engine);
    this.registerMusicSourceExecutor(engine);
    this.registerSoundOverlayExecutor(engine);
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

    engine.registerExecutor('aiAvatarVideo', async (_node, inputs, context) => {
      const script = this.helper.getRequiredStringInput(inputs, 'script');
      const result = await avatarVideoGenerationService.generateAvatarVideo(
        {
          aspectRatio: this.helper.getAspectRatioConfig(
            _node.config.aspectRatio,
          ),
          audioUrl: this.helper.getOptionalStringInput(inputs, 'audioUrl'),
          clonedVoiceId: this.helper.getOptionalStringInput(
            inputs,
            'clonedVoiceId',
          ),
          photoUrl: this.helper.getOptionalStringInput(inputs, 'photoUrl'),
          text: script,
          useIdentity:
            _node.config.useIdentityDefaults === undefined
              ? true
              : Boolean(_node.config.useIdentityDefaults),
        },
        {
          brandId: this.helper.readConfigString(_node.config, 'brandId'),
          organizationId: context.organizationId,
          userId: context.userId,
        },
      );

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

        await captionsService.create(
          new CaptionEntity({
            content: captionContent,
            format: CaptionFormat.SRT,
            ingredient: sourceIngredientId,
            isDeleted: false,
            language: CaptionLanguage.EN,
            user: context.userId,
          }),
        );

        const { ingredientData, metadataData } =
          await sharedService.saveDocumentsInternal({
            brand: brandId,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            organization: context.organizationId,
            parent: sourceIngredientId,
            status: IngredientStatus.PROCESSING,
            user: context.userId,
          });

        const ingredientId = ingredientData.id.toString();
        const job = await fileQueueService.processVideo({
          authProviderUserId: context.userId,
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
          brand: brandId,
          isDeleted: false,
          organization: context.organizationId,
          status: IngredientStatus.GENERATED,
        })) ??
        (await musicsService.findOne({
          isDeleted: false,
          organization: context.organizationId,
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
            authProviderUserId: context.userId,
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
}
