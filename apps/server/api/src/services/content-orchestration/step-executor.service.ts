import { ByokService } from '@api/services/byok/byok.service';
import type {
  ImageToVideoStep,
  PipelineStep,
  StepResult,
  TextToImageStep,
  TextToMusicStep,
  TextToSpeechStep,
} from '@api/services/content-orchestration/pipeline.interfaces';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import {
  ByokProvider,
  ImageTaskModel,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';

export interface StepExecutionContext {
  organizationId: string;
  previousResult?: StepResult;
  globalPrompt?: string;
}

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
    private readonly fleetService: FleetService,
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
        const result = await this.higgsFieldService.generateImageToVideo({
          aspectRatio: step.aspectRatio ?? '9:16',
          duration: step.duration ?? 5,
          imageUrl,
          organizationId: context.organizationId,
          prompt,
        });
        const completed = await this.higgsFieldService.waitForCompletion(
          result.requestId,
          { organizationId: context.organizationId },
        );
        return { contentType: 'video/mp4', url: completed.videoUrl };
      }

      case VideoTaskModel.FAL: {
        const result = await this.falService.generateVideo(
          'fal-ai/minimax/video-01-live',
          { image_url: imageUrl, prompt },
        );
        return { contentType: 'video/mp4', url: result.url };
      }

      case VideoTaskModel.COMFYUI: {
        const result = await this.fleetService.generateVideo({
          imageUrl,
          prompt,
        });
        if (!result) {
          throw new Error('Fleet videos instance not available');
        }
        return this.pollComfyUIJob(result.jobId);
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
        const result = await this.elevenLabsService.textToSpeech(
          step.voiceId,
          text,
          context.organizationId,
        );
        // ElevenLabs returns AudioWithTimestampsResponse; extract audio
        const audioBase64 =
          typeof (result as unknown as Record<string, unknown>).audio_base64 ===
          'string'
            ? ((result as unknown as Record<string, unknown>)
                .audio_base64 as string)
            : '';
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

  private async executeTextToMusic(
    step: TextToMusicStep,
    context: StepExecutionContext,
  ): Promise<StepResult> {
    const prompt = step.prompt ?? context.globalPrompt ?? '';
    if (!prompt) {
      throw new Error('Text-to-music step requires prompt');
    }

    switch (step.model) {
      case MusicTaskModel.REPLICATE: {
        const byokKey = await this.byokService.resolveApiKey(
          context.organizationId,
          ByokProvider.REPLICATE,
        );
        const predictionId = await this.replicateService.runModel(
          'meta/musicgen:latest',
          {
            duration: step.duration ?? 10,
            prompt,
          },
          byokKey?.apiKey,
        );
        return this.pollReplicateMusicPrediction(predictionId, byokKey?.apiKey);
      }

      default:
        throw new Error(
          `Music model ${step.model} not yet supported in v2 pipeline`,
        );
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private async pollComfyUIJob(jobId: string): Promise<StepResult> {
    const pollInterval = 10000;
    const timeout = 600000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.fleetService.pollJob('videos', jobId);

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
