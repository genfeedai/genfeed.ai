import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationService } from '@api/collections/musics/services/music-generation.service';
import type { MusicGenerationProvider } from '@api/collections/musics/services/music-generation.types';
import { MusicGenerationProviderRegistryService } from '@api/collections/musics/services/music-generation-provider-registry.service';
import { ByokService } from '@api/services/byok/byok.service';
import type {
  ImageToVideoStep,
  PipelineStep,
  StepResult,
  TextToImageStep,
  TextToMusicStep,
  TextToSpeechStep,
} from '@api/services/content-orchestration/pipeline.interfaces';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  ByokProvider,
  ImageTaskModel,
  ModelCategory,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/contracts';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';

export interface StepExecutionContext {
  organizationId: string;
  /** Brand whose saved defaults apply to steps without an explicit model. */
  brandId?: string;
  previousResult?: StepResult;
  globalPrompt?: string;
  runReferences?: readonly GenerationBriefReference[];
}

/** Music providers whose calls can run on the organization's own key. */
const MUSIC_BYOK_PROVIDERS: Partial<
  Record<MusicGenerationProvider, ByokProvider>
> = {
  fal: ByokProvider.FAL,
  replicate: ByokProvider.REPLICATE,
};

const DEFAULT_MUSIC_STEP_DURATION_SECONDS = 10;

interface ReplicatePredictionOutput {
  output?: string | string[] | Record<string, unknown> | null;
  status?: string;
}

@Injectable()
export class StepExecutorService {
  constructor(
    private readonly logger: LoggerService,
    private readonly byokService: ByokService,
    private readonly falService: FalService,
    private readonly higgsFieldService: HiggsFieldService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly managedInferenceRuntimeService: ManagedInferenceRuntimeService,
    private readonly musicGenerationService: MusicGenerationService,
    private readonly musicProviderRegistry: MusicGenerationProviderRegistryService,
    private readonly replicateService: ReplicateService,
  ) {}

  @SentryTraced()
  async execute(
    step: PipelineStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    this.logger.log(
      `StepExecutorService executing step type=${step.type} model=${step.model}`,
    );

    switch (step.type) {
      case 'text-to-image':
        return this.executeTextToImage(step, context);
      case 'image-to-video':
        return this.executeImageToVideo(step, context);
      case 'text-to-speech':
        return this.executeTextToSpeech(step, context);
      case 'text-to-music':
        return this.executeTextToMusic(step, context);
    }
  }

  // ── Text-to-Image ───────────────────────────────────────────────────

  private async executeTextToImage(
    step: TextToImageStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    const prompt = step.prompt ?? context.globalPrompt ?? '';

    switch (step.model) {
      case ImageTaskModel.FAL: {
        const result = await this.falService.generateImage('fal-ai/flux/dev', {
          image_size: step.aspectRatio ?? '1024x1024',
          prompt,
        });
        return { contentType: 'image/png', url: result.url };
      }

      default:
        throw new Error(
          `Image model ${step.model} not yet supported in v2 pipeline`,
        );
    }
  }

  // ── Image-to-Video ──────────────────────────────────────────────────

  private async executeImageToVideo(
    step: ImageToVideoStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    const imageUrl = step.imageUrl ?? context.previousResult?.url;
    const prompt = step.prompt ?? context.globalPrompt ?? '';

    if (!imageUrl) {
      throw new Error(
        'Image-to-video step requires an imageUrl or a preceding step that produces an image',
      );
    }

    switch (step.model) {
      case VideoTaskModel.HIGGSFIELD: {
        // DoP sizes the clip from the source image, so the step's
        // `aspectRatio` / `duration` have no input to map onto.
        const result = await this.higgsFieldService.generateImageToVideo({
          imageUrl,
          modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
          organizationId: context.organizationId,
          prompt,
        });
        const { videoUrl } =
          await this.higgsFieldService.waitForVideoCompletion(
            result.requestId,
            {
              organizationId: context.organizationId,
            },
          );
        return { contentType: 'video/mp4', url: videoUrl };
      }

      case VideoTaskModel.FAL: {
        const result = await this.falService.generateVideo(
          'fal-ai/minimax/video-01-live',
          { image_url: imageUrl, prompt },
        );
        return { contentType: 'video/mp4', url: result.url };
      }

      case VideoTaskModel.COMFYUI: {
        const result = await this.managedInferenceRuntimeService.generateVideo({
          imageUrl,
          organizationId: context.organizationId,
          prompt,
        });
        if (!result) {
          throw new Error('Fleet videos instance not available');
        }
        return this.pollComfyUIJob(result.jobId, context.organizationId);
      }

      default:
        throw new Error(
          `Video model ${step.model} not yet supported in v2 pipeline`,
        );
    }
  }

  // ── Text-to-Speech ──────────────────────────────────────────────────

  private async executeTextToSpeech(
    step: TextToSpeechStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    const text = step.text ?? context.globalPrompt ?? '';
    if (!text) {
      throw new Error('Text-to-speech step requires text');
    }

    switch (step.model) {
      case MusicTaskModel.ELEVENLABS: {
        const { audioBase64 } = await this.elevenLabsService.textToSpeech(
          step.voiceId,
          text,
          context.organizationId,
        );
        return {
          contentType: 'audio/mpeg',
          url: `data:audio/mpeg;base64,${audioBase64}`,
        };
      }

      default:
        throw new Error(
          `TTS model ${step.model} not yet supported in v2 pipeline`,
        );
    }
  }

  // ── Text-to-Music ──────────────────────────────────────────────────

  /**
   * The model comes from the same policy as the music API: an explicit step
   * model stays strict, otherwise the brand/organization saved default while
   * active, otherwise the registry's active music default. The resolved
   * registry row decides the provider and endpoint — nothing is hardcoded.
   */
  private async executeTextToMusic(
    step: TextToMusicStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    const prompt = step.prompt ?? context.globalPrompt ?? '';
    if (!prompt) {
      throw new Error('Text-to-music step requires prompt');
    }

    const { model, modelDocument } =
      await this.musicGenerationService.resolveMusicModel({
        brandId: context.brandId,
        explicitModel: step.model,
        organizationId: context.organizationId,
      });
    const provider = this.musicProviderRegistry.providerFor(
      model,
      modelDocument.provider,
    );
    const apiKeyOverride = await this.resolveMusicApiKey(
      provider,
      context.organizationId,
    );
    const duration = step.duration ?? DEFAULT_MUSIC_STEP_DURATION_SECONDS;
    const result = await this.musicProviderRegistry.generate({
      apiKeyOverride,
      createMusicDto: Object.assign(new CreateMusicDto(), {
        duration,
        text: prompt,
      }),
      duration,
      model,
      modelCategory: ModelCategory.MUSIC,
      modelEndpoint: String(modelDocument.endpoint),
      modelProvider: modelDocument.provider,
      outputs: 1,
      prompt,
      seed: -1,
    });

    if (result.outputUrl) {
      return { contentType: 'audio/mpeg', url: result.outputUrl };
    }
    if (provider !== 'replicate') {
      throw new Error(
        `Music model ${model} returned no output URL from ${provider ?? 'an unknown provider'}`,
      );
    }
    return this.pollReplicateMusicPrediction(result.externalId, apiKeyOverride);
  }

  private async resolveMusicApiKey(
    provider: MusicGenerationProvider | null,
    organizationId: string,
  ): Promise<string | undefined> {
    const byokProvider = provider ? MUSIC_BYOK_PROVIDERS[provider] : undefined;
    if (!byokProvider) {
      return undefined;
    }
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      byokProvider,
    );
    return byokKey?.apiKey;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private async pollComfyUIJob(
    jobId: string,
    organizationId?: string,
  ): Promise<StepResult> {
    const pollInterval = 10000;
    const timeout = 600000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.managedInferenceRuntimeService.pollJob(
        'videos',
        jobId,
        organizationId,
      );

      if (
        status &&
        (status as Record<string, unknown>).status === 'completed'
      ) {
        const output = (status as Record<string, unknown>).output as
          | Record<string, unknown>
          | undefined;
        if (output?.video_url) {
          return { contentType: 'video/mp4', url: output.video_url as string };
        }
      }

      if (status && (status as Record<string, unknown>).status === 'failed') {
        throw new Error(`ComfyUI job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`ComfyUI job ${jobId} timed out`);
  }

  private async pollReplicateMusicPrediction(
    predictionId: string,
    apiKeyOverride?: string,
  ): Promise<StepResult> {
    const pollInterval = 5000;
    const timeout = 180000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const prediction = (await this.replicateService.getPrediction(
        predictionId,
        apiKeyOverride,
      )) as ReplicatePredictionOutput;

      if (prediction.status === 'succeeded') {
        const url = this.extractReplicateOutputUrl(prediction.output);
        if (!url) {
          throw new Error(
            `Replicate music prediction ${predictionId} completed without an output URL`,
          );
        }

        return {
          contentType: 'audio/mpeg',
          url,
        };
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(
          `Replicate music prediction ${predictionId} ${prediction.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Replicate music prediction ${predictionId} timed out`);
  }

  private extractReplicateOutputUrl(
    output: ReplicatePredictionOutput['output'],
  ): string | null {
    if (typeof output === 'string') {
      return output;
    }

    if (Array.isArray(output)) {
      const firstUrl = output.find((item) => typeof item === 'string');
      return typeof firstUrl === 'string' ? firstUrl : null;
    }

    if (!output || typeof output !== 'object') {
      return null;
    }

    const outputRecord = output as Record<string, unknown>;
    if (typeof outputRecord.url === 'string') {
      return outputRecord.url;
    }

    if (Array.isArray(outputRecord.urls)) {
      const firstUrl = outputRecord.urls.find(
        (item) => typeof item === 'string',
      );
      return typeof firstUrl === 'string' ? firstUrl : null;
    }

    if (typeof outputRecord.audio === 'string') {
      return outputRecord.audio;
    }

    return null;
  }
}
