import {
  canReceiveProviderWebhooks,
  isCloudDeployment,
} from '@genfeedai/config';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import Replicate from 'replicate';

type ReplicatePredictionTarget = { model: string } | { version: string };

/**
 * Replicate accepts official model slugs through `model`, while immutable
 * version IDs must be sent through `version`. Stored model keys may include
 * both (`owner/model:version`), in which case the immutable version wins.
 */
function resolvePredictionTarget(
  modelIdentifier: string,
): ReplicatePredictionTarget {
  const versionSeparator = modelIdentifier.lastIndexOf(':');
  if (versionSeparator >= 0) {
    const version = modelIdentifier.slice(versionSeparator + 1);
    if (version.length > 0) {
      return { version };
    }
  }

  return modelIdentifier.includes('/')
    ? { model: modelIdentifier }
    : { version: modelIdentifier };
}

@Injectable()
export class ReplicateService {
  private readonly constructorName: string = String(this.constructor.name);
  // Eager initialization - create client in constructor to avoid race conditions
  // NestJS creates singleton services, so this runs once at startup
  public client: Replicate;

  private readonly ratios: Record<string, string> = {
    '512:512': '1:1',
    '576:1024': '9:16',
    '720:1280': '9:16',
    '1024:576': '16:9',
    // Square (1:1)
    '1024:1024': '1:1',

    // Ultra-wide Portrait (1:2)
    '1024:2048': '1:2',
    '1080:1080': '1:1',

    // Portrait (9:16)
    '1080:1920': '9:16',
    '1280:720': '16:9',

    // Portrait (3:4)
    '1440:1920': '3:4',

    // Landscape (16:9)
    '1920:1080': '16:9',

    // Landscape (4:3)
    '1920:1440': '4:3',

    // Ultra-wide Landscape (2:1)
    '2048:1024': '2:1',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    // Eager initialization - create client in constructor to avoid race conditions
    this.client = new Replicate({
      auth: this.configService.get('REPLICATE_KEY'),
    });
  }

  private getClientForRequest(apiKeyOverride?: string): Replicate {
    if (apiKeyOverride) {
      return new Replicate({ auth: apiKeyOverride });
    }
    return this.client;
  }

  /**
   * Register a Replicate completion webhook only when this deployment is
   * cloud-mode AND the webhook base URL is reachable from the public internet.
   * Local SaaS (`GENFEED_CLOUD=true` + `api.genfeed.localhost`) must poll
   * instead — Replicate cannot POST to Portless hosts.
   */
  private resolveCompletionWebhookUrl(
    workflowContinuationId?: string,
  ): string | undefined {
    if (!isCloudDeployment()) {
      return undefined;
    }

    const webhooksBase = this.configService.get('GENFEEDAI_WEBHOOKS_URL');
    if (!canReceiveProviderWebhooks(webhooksBase)) {
      this.loggerService.warn(
        `${this.constructorName} skipping Replicate webhook — base URL is not publicly reachable`,
        { webhooksBase: webhooksBase || null },
      );
      return undefined;
    }

    const callbackUrl = `${webhooksBase}/v1/webhooks/replicate/callback`;
    return workflowContinuationId
      ? `${callbackUrl}?workflowContinuationId=${encodeURIComponent(workflowContinuationId)}`
      : callbackUrl;
  }

  public async runModel(
    modelIdentifier: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
    workflowContinuationId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const target = resolvePredictionTarget(modelIdentifier);
      this.loggerService.log(`${url} started`, {
        input,
        modelIdentifier,
        target,
      });

      const client = this.getClientForRequest(apiKeyOverride);
      const webhookUrl = this.resolveCompletionWebhookUrl(
        workflowContinuationId,
      );

      const res = await client.predictions.create({
        input,
        ...target,
        ...(webhookUrl && {
          webhook: webhookUrl,
          webhook_events_filter: ['completed'],
        }),
      });

      return res.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Create a training job on Replicate using the Trainings API.
   * Falls back to configured trainer version if not provided.
   */
  public async runTraining(
    destination: `${string}/${string}`,
    input: {
      input_images: string;
      trigger_word: string;
      training_steps: number;
      seed?: number;
      lora_type?: string;
    },
    trainerVersion?: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      // Use provided trainer version or default from config
      const versionString =
        trainerVersion || this.configService.get('REPLICATE_MODELS_TRAINER');

      // Expect format like: "replicate/fast-flux-trainer:<hash>"
      const [ownerModel, version] = String(versionString).split(':');
      const [owner, model] = String(ownerModel).split('/');

      this.loggerService.log(`${url} started`, {
        destination,
        input,
        model,
        owner,
        version,
      });

      const client = this.getClientForRequest(apiKeyOverride);
      const webhookUrl = this.resolveCompletionWebhookUrl();

      const attempt = async () =>
        client.trainings.create(owner, model, version, {
          destination,
          input,
          ...(webhookUrl && {
            webhook: webhookUrl,
            webhook_events_filter: ['completed'],
          }),
        });

      try {
        const training = await attempt();
        return training.id;
      } catch (error: unknown) {
        const message = (error as Error)?.message || '';
        const apiError = error as {
          detail?: string;
          status?: number;
          code?: string;
        };
        const detail = apiError?.detail || '';
        const status = apiError?.status || apiError?.code;

        const destinationMissing =
          status === 404 ||
          /destination/i.test(message) ||
          /destination/i.test(detail);

        if (destinationMissing) {
          const [destOwner, destModel] = String(destination).split('/');
          this.loggerService.warn(
            `${url} destination missing, creating model then retrying`,
          );

          await client.models.create(destOwner, destModel, {
            hardware:
              this.configService.get('REPLICATE_MODEL_HARDWARE') || 'gpu-t4',
            visibility:
              this.configService.get('REPLICATE_MODEL_VISIBILITY') || 'private',
          });

          const training = await attempt();
          return training.id;
        }

        throw error;
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getPrediction(
    id: string,
    apiKeyOverride?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, { id });

      const client = this.getClientForRequest(apiKeyOverride);
      const res = await client.predictions.get(id);

      return res;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async cancelPrediction(
    id: string,
    apiKeyOverride?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, { id });

      const client = this.getClientForRequest(apiKeyOverride);
      await client.predictions.cancel(id);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public generateImageToVideo(
    version: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string> {
    return this.runModel(version, input, apiKeyOverride);
  }

  public generateTextToVideo(
    version: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string> {
    return this.runModel(version, input, apiKeyOverride);
  }

  public generateTextToImage(
    version: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string> {
    return this.runModel(version, input, apiKeyOverride);
  }

  public enhanceVideo(
    videoUrl: string,
    apiKeyOverride?: string,
  ): Promise<string> {
    return this.runModel(
      'topazlabs/video-upscale',
      {
        target_fps: this.configService.get('REPLICATE_TARGET_FPS'),
        target_resolution: this.configService.get(
          'REPLICATE_TARGET_RESOLUTION',
        ),
        video: videoUrl,
      },
      apiKeyOverride,
    );
  }

  /**
   * Generate text completion using LLM models via Replicate
   * Uses webhook callback for async completion (same pattern as video/image)
   *
   * @param version - Model version string (e.g., 'meta/meta-llama-3.1-405b-instruct')
   * @param input - Model-specific input parameters
   * @returns Prediction ID for tracking
   */
  public generateTextCompletion(
    version: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string> {
    return this.runModel(version, input, apiKeyOverride);
  }

  /**
   * Generate text completion and wait for result (synchronous)
   * Use this when you need the result immediately (text generation is fast)
   *
   * @param version - Model version string
   * @param input - Model-specific input parameters
   * @returns Generated text content
   */
  public async generateTextCompletionSync(
    modelIdentifier: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const target = resolvePredictionTarget(modelIdentifier);
      this.loggerService.log(`${url} started`, {
        input,
        modelIdentifier,
        target,
      });

      const client = this.getClientForRequest(apiKeyOverride);
      const prediction = await client.predictions.create({
        input,
        ...target,
      });

      // Wait for the prediction to complete
      const result = await client.wait(prediction);

      // Handle different output formats (string or array of tokens)
      const output = Array.isArray(result.output)
        ? result.output.join('')
        : String(result.output || '');

      this.loggerService.log(`${url} completed`, {
        id: result.id,
        outputLength: output.length,
      });

      return output;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private isNumberVector(value: unknown): value is number[] {
    return (
      Array.isArray(value) &&
      value.every(
        (component) =>
          typeof component === 'number' && Number.isFinite(component),
      )
    );
  }

  /** Generate a fixed-width text embedding through a routed Replicate model. */
  public async generateEmbedding(
    modelIdentifier: string,
    text: string,
    apiKeyOverride?: string,
  ): Promise<number[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, { textLength: text.length });

      const client = this.getClientForRequest(apiKeyOverride);
      const prediction = await client.predictions.create({
        input: { texts: JSON.stringify([text]) },
        ...resolvePredictionTarget(modelIdentifier),
      });

      // Wait for the prediction to complete
      const result = await client.wait(prediction);

      const output = result.output;
      const embedding = this.isNumberVector(output)
        ? output
        : Array.isArray(output) && this.isNumberVector(output[0])
          ? output[0]
          : undefined;

      if (!embedding || embedding.length !== CONTEXT_EMBEDDING_DIMENSION) {
        throw new Error(
          `Embedding model ${modelIdentifier} returned ${embedding?.length ?? 0} dimensions; expected ${CONTEXT_EMBEDDING_DIMENSION}`,
        );
      }

      this.loggerService.log(`${url} completed`, {
        dimensions: embedding?.length,
        id: result.id,
      });

      return embedding;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public getAspectRatio(width?: number, height?: number): string {
    if (!width || !height) {
      return '16:9'; // Default to landscape
    }

    // Check if we have an exact match
    const key = `${width}:${height}`;
    if (this.ratios[key]) {
      return this.ratios[key];
    }

    // Calculate the aspect ratio
    const gcd = this.calculateGCD(width, height);
    const aspectWidth = width / gcd;
    const aspectHeight = height / gcd;

    // Map to closest standard ratio
    const ratio = aspectWidth / aspectHeight;

    if (Math.abs(ratio - 1) < 0.1) {
      return '1:1'; // Square
    }
    if (Math.abs(ratio - 16 / 9) < 0.1) {
      return '16:9'; // Landscape
    }
    if (Math.abs(ratio - 9 / 16) < 0.1) {
      return '9:16'; // Portrait
    }
    if (Math.abs(ratio - 4 / 3) < 0.1) {
      return '4:3'; // Classic TV
    }
    if (Math.abs(ratio - 3 / 4) < 0.1) {
      return '3:4'; // Portrait classic
    }
    if (Math.abs(ratio - 2 / 1) < 0.1) {
      return '2:1'; // Ultra-wide landscape
    }
    if (Math.abs(ratio - 1 / 2) < 0.1) {
      return '1:2'; // Ultra-wide portrait
    }

    // Default based on orientation
    return width > height ? '16:9' : '9:16';
  }

  private calculateGCD(a: number, b: number): number {
    return b === 0 ? a : this.calculateGCD(b, a % b);
  }

  /**
   * Parse and transform input parameters for a Replicate model run.
   * Handles VEO-3 JSON prompt wrapping, num_outputs for trained models, etc.
   */
  public parseReplicateInput(
    model: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { ...params };

    // Include num_outputs for trained/owned models
    const owner = this.configService.get('REPLICATE_OWNER');
    if (owner && typeof model === 'string' && model.startsWith(`${owner}/`)) {
      if (params.outputs !== undefined) {
        input.num_outputs = params.outputs;
      }
    }

    // Google VEO models require JSON-formatted prompt with elements
    const isGoogleModel =
      typeof model === 'string' && model.startsWith('google/');

    if (isGoogleModel) {
      const isVeo3 = model === 'google/veo-3' || model === 'google/veo-3-fast';
      const elements: Record<string, unknown> = {};

      if (isVeo3) {
        const speech =
          typeof params.speech === 'string' ? params.speech.trim() : '';
        if (speech) {
          elements.speech = speech;
        }
      }

      const jsonPrompt: Record<string, unknown> = {
        elements,
        prompt: params.prompt,
      };

      input.prompt = JSON.stringify(jsonPrompt);
    }

    return input;
  }

  /**
   * Transcribe audio using Whisper model via Replicate
   * Supports both URL and buffer inputs
   *
   * @param options - Audio transcription options
   * @returns Transcription result with text, language, and duration
   */
  public async transcribeAudio(
    options: {
      audio: {
        type: 'buffer' | 'url';
        data?: Buffer;
        filename?: string;
        url?: string;
      };
      language?: string;
      prompt?: string;
    },
    apiKeyOverride?: string,
  ): Promise<{
    text: string;
    language: string;
    duration: number;
    confidence?: number;
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{ start: number; end: number; word: string }>;
    }>;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      this.loggerService.log(`${url} started`, {
        audioType: options.audio.type,
        hasPrompt: !!options.prompt,
        language: options.language,
      });

      let audioInput: string;

      if (options.audio.type === 'buffer') {
        if (!options.audio.data) {
          throw new Error('Buffer data is required for buffer type');
        }
        // Convert buffer to data URI for Replicate
        const mimeType = this.getMimeType(
          options.audio.filename || 'audio.mp3',
        );
        const base64Data = options.audio.data.toString('base64');
        audioInput = `data:${mimeType};base64,${base64Data}`;
      } else {
        if (!options.audio.url) {
          throw new Error('URL is required for url type');
        }
        audioInput = options.audio.url;
      }

      const input: Record<string, unknown> = {
        audio: audioInput,
      };

      // Add optional language parameter (Whisper uses ISO 639-1 codes)
      if (options.language && options.language !== 'auto') {
        input.language = options.language;
      }

      // Add optional prompt parameter for context
      if (options.prompt) {
        input.initial_prompt = options.prompt;
      }

      // Use openai/whisper model on Replicate
      const client = this.getClientForRequest(apiKeyOverride);
      const prediction = await client.predictions.create({
        input,
        model: 'openai/whisper',
      });

      // Wait for the prediction to complete
      const result = await client.wait(prediction);

      // Parse the Whisper output
      const output = result.output as {
        text?: string;
        language?: string;
        segments?: Array<{
          start: number;
          end: number;
          text: string;
          words?: Array<{ start: number; end: number; word: string }>;
        }>;
      };

      // Calculate duration from segments if available
      let duration = 0;
      if (output.segments && output.segments.length > 0) {
        const lastSegment = output.segments[output.segments.length - 1];
        duration = lastSegment.end || 0;
      }

      this.loggerService.log(`${url} completed`, {
        duration,
        id: result.id,
        language: output.language || 'unknown',
        textLength: output.text?.length || 0,
      });

      return {
        confidence: undefined, // Whisper doesn't provide confidence scores
        duration,
        language: output.language || 'unknown',
        segments: output.segments,
        text: output.text || '',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private getMimeType(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();

    const mimeTypes: Record<string, string> = {
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      mp4: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    };

    return mimeTypes[extension || ''] || 'audio/mpeg';
  }
}
