import {
  SERVER_TOKENS,
  type ServerCustomerInstanceResolver,
} from '@api/server.dependencies';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { appendWebhookToken } from '@api/webhooks/webhook-token.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';

type ManagedInferenceRuntimeRole = 'images' | 'voices' | 'videos';

interface ManagedInferenceRuntime {
  apiUrl: string;
  isConfigured: boolean;
}

/** Body of the images runtime's `POST /generate/image` and `/generate/pulid`. */
export interface ManagedImageGenerationRequest {
  organizationId: string;
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  referenceImageUrl?: string;
  loraPath?: string;
}

/** A job as the images runtime reports it from `GET /generate/:jobId`. */
interface ManagedImageJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  error?: string;
}

const IMAGE_JOB_POLL_INTERVAL_MS = 2_000;
const IMAGE_JOB_TIMEOUT_MS = 300_000;

/**
 * Client for configured self-hosted or managed media runtimes.
 *
 * Runtime implementations and lifecycle controls live outside the public
 * monorepo. This adapter preserves the Community, BYOK, and provider=genfeedai
 * request paths without owning GPU infrastructure.
 */
@Injectable()
export class ManagedInferenceRuntimeService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly instances: Map<
    ManagedInferenceRuntimeRole,
    ManagedInferenceRuntime
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    @Inject(SERVER_TOKENS.customerInstances)
    private readonly customerInstancesService: ServerCustomerInstanceResolver,
    private readonly pollUntilService: PollUntilService,
  ) {
    this.instances = new Map<
      ManagedInferenceRuntimeRole,
      ManagedInferenceRuntime
    >([
      [
        'images',
        {
          apiUrl: this.configService.get('GPU_IMAGES_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_IMAGES_URL')),
        },
      ],
      [
        'voices',
        {
          apiUrl: this.configService.get('GPU_VOICES_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_VOICES_URL')),
        },
      ],
      [
        'videos',
        {
          apiUrl: this.configService.get('GPU_VIDEOS_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_VIDEOS_URL')),
        },
      ],
    ]);
  }

  /**
   * Resolve the API URL for a given organization and runtime role.
   * Returns the org's dedicated instance URL if one is running,
   * otherwise falls back to the shared runtime URL from config.
   */
  async getInstanceUrlForOrg(
    organizationId: string,
    role: ManagedInferenceRuntimeRole,
  ): Promise<string | null> {
    const dedicated = await this.customerInstancesService.findRunningForOrg(
      organizationId,
      role,
    );

    if (dedicated) {
      return dedicated.apiUrl ?? null;
    }

    return this.getInstanceUrl(role);
  }

  async hasDedicatedInstanceForOrg(
    organizationId: string,
    role: ManagedInferenceRuntimeRole,
  ): Promise<boolean> {
    const instance = await this.customerInstancesService.findRunningForOrg(
      organizationId,
      role,
    );

    return Boolean(instance?.apiUrl);
  }

  /**
   * Get the API URL for a runtime, or null if it is not configured.
   */
  getInstanceUrl(role: ManagedInferenceRuntimeRole): string | null {
    const instance = this.instances.get(role);
    if (!instance?.isConfigured || !instance.apiUrl) {
      return null;
    }
    return instance.apiUrl;
  }

  private async resolveInstanceUrl(
    role: ManagedInferenceRuntimeRole,
    caller: string,
    organizationId?: string,
  ): Promise<string | null> {
    try {
      return organizationId
        ? await this.getInstanceUrlForOrg(organizationId, role)
        : this.getInstanceUrl(role);
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: `Failed to resolve ${role} instance URL`,
        organizationId,
      });
      return null;
    }
  }

  /**
   * Check if a runtime is configured and responds to its health check.
   */
  async isAvailable(role: ManagedInferenceRuntimeRole): Promise<boolean> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.getInstanceUrl(role);

    if (!url) {
      return false;
    }

    try {
      await axios.get(`${url}/v1/health`, { timeout: 5000 });
      return true;
    } catch {
      this.loggerService.warn(caller, {
        message: `Managed inference runtime ${role} is not available`,
        url,
      });
      return false;
    }
  }

  private getWebhookUrl(
    path: string,
    secretKey: 'FLEET_WEBHOOK_SECRET',
  ): string | undefined {
    const baseUrl = this.configService.get('GENFEEDAI_WEBHOOKS_URL');

    if (!baseUrl) {
      return undefined;
    }

    return appendWebhookToken(
      `${baseUrl}/v1/${path}`,
      this.configService.get(secretKey) as string | undefined,
    );
  }

  /**
   * Proxy POST to videos instance to generate video from image.
   */
  async generateVideo(params: {
    organizationId?: string;
    imageUrl: string;
    prompt: string;
    negativePrompt?: string;
    numFrames?: number;
    fps?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    seed?: number;
  }): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(
      'videos',
      caller,
      params.organizationId,
    );

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Videos instance not configured',
      });
      return null;
    }

    try {
      const response = await axios.post(
        `${url}/generate/video`,
        {
          cfg: params.cfg ?? 3.0,
          fps: params.fps ?? 16,
          height: params.height ?? 480,
          image_url: params.imageUrl,
          negative_prompt:
            params.negativePrompt ??
            'blurry, distorted, low quality, watermark, text, morphing, flickering',
          num_frames: params.numFrames ?? 81,
          prompt: params.prompt,
          seed: params.seed ?? 42,
          steps: params.steps ?? 20,
          width: params.width ?? 832,
        },
        { timeout: 30000 },
      );

      return { jobId: response.data.job_id };
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Video generation failed',
      });
      return null;
    }
  }

  /**
   * Proxy POST to an org-specific videos instance only.
   * This intentionally does not fall back to the shared runtime URL because
   * GenfeedAI managed provider access is assigned per customer from console.
   */
  async generateManagedVideoForOrg(params: {
    organizationId: string;
    imageUrl: string;
    prompt: string;
    negativePrompt?: string;
    numFrames?: number;
    fps?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    seed?: number;
  }): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const instance = await this.customerInstancesService.findRunningForOrg(
      params.organizationId,
      'videos',
    );
    const url = instance?.apiUrl ?? null;

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Managed videos instance is not enabled for organization',
        organizationId: params.organizationId,
      });
      return null;
    }

    return await this.postVideoGeneration(url, params, caller);
  }

  async pollManagedJobForOrg(
    organizationId: string,
    role: ManagedInferenceRuntimeRole,
    jobId: string,
  ): Promise<Record<string, unknown> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const instance = await this.customerInstancesService.findRunningForOrg(
      organizationId,
      role,
    );
    const url = instance?.apiUrl ?? null;

    if (!url) {
      return null;
    }

    try {
      const response = await axios.get(`${url}/generate/${jobId}`, {
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: `Poll managed job failed for ${role}/${jobId}`,
        organizationId,
      });
      return null;
    }
  }

  private async postVideoGeneration(
    url: string,
    params: {
      imageUrl: string;
      prompt: string;
      negativePrompt?: string;
      numFrames?: number;
      fps?: number;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      seed?: number;
    },
    caller: string,
  ): Promise<{ jobId: string } | null> {
    try {
      const response = await axios.post(
        `${url}/generate/video`,
        {
          cfg: params.cfg ?? 3.0,
          fps: params.fps ?? 16,
          height: params.height ?? 480,
          image_url: params.imageUrl,
          negative_prompt:
            params.negativePrompt ??
            'blurry, distorted, low quality, watermark, text, morphing, flickering',
          num_frames: params.numFrames ?? 81,
          prompt: params.prompt,
          seed: params.seed ?? 42,
          steps: params.steps ?? 20,
          width: params.width ?? 832,
        },
        { timeout: 30000 },
      );

      return { jobId: response.data.job_id };
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Video generation failed',
      });
      return null;
    }
  }

  /**
   * Proxy POST to voices instance to generate speech from text.
   */
  async generateVoice(params: {
    organizationId?: string;
    text: string;
    voicePreset?: string;
    referenceAudio?: string;
    referenceTranscript?: string;
  }): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(
      'voices',
      caller,
      params.organizationId,
    );

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Voices instance not configured',
      });
      return null;
    }

    try {
      const response = await axios.post(
        `${url}/generate/tts`,
        {
          reference_audio: params.referenceAudio,
          reference_transcript: params.referenceTranscript,
          text: params.text,
          voice_preset: params.voicePreset ?? 'default',
        },
        { timeout: 30000 },
      );

      return { jobId: response.data.job_id };
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Voice generation failed',
      });
      return null;
    }
  }

  /**
   * Poll job status on a configured runtime.
   */
  async pollJob(
    role: ManagedInferenceRuntimeRole,
    jobId: string,
    organizationId?: string,
  ): Promise<Record<string, unknown> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(role, caller, organizationId);

    if (!url) {
      return null;
    }

    try {
      const response = await axios.get(`${url}/generate/${jobId}`, {
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: `Poll job failed for ${role}/${jobId}`,
      });
      return null;
    }
  }

  /**
   * Clone a voice on the self-hosted voices instance.
   */
  async cloneVoice(params: {
    audioUrl: string;
    handle: string;
    label: string;
  }): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.getInstanceUrl('voices');

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Voices instance not configured',
      });
      return null;
    }

    try {
      const response = await axios.post(
        `${url}/voices/clone`,
        {
          audio_url: params.audioUrl,
          callback_url: this.getWebhookUrl(
            'webhooks/fleet/voice-clone',
            'FLEET_WEBHOOK_SECRET',
          ),
          handle: params.handle,
          label: params.label,
        },
        { timeout: 30000 },
      );

      return { jobId: response.data.job_id };
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Voice cloning failed',
      });
      return null;
    }
  }
  /**
   * Generate one image on the images runtime and wait for its result URL.
   * Face models (`-pulid`) use `/generate/pulid`; every other model uses
   * `/generate/image`. Throws when the runtime is missing or the job fails, so
   * the caller records a failed generation.
   */
  async generateImage(
    params: ManagedImageGenerationRequest,
  ): Promise<{ jobId: string; resultUrl: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(
      'images',
      caller,
      params.organizationId,
    );

    if (!url) {
      throw new Error('The Genfeed images runtime is not configured');
    }

    const isFaceModel = params.model.includes('-pulid');
    const response = await axios.post<ManagedImageJob>(
      `${url}/generate/${isFaceModel ? 'pulid' : 'image'}`,
      {
        height: params.height,
        ...(params.loraPath ? { loraPath: params.loraPath } : {}),
        model: params.model,
        prompt: params.prompt,
        ...(params.referenceImageUrl
          ? { referenceImageUrl: params.referenceImageUrl }
          : {}),
        seed: params.seed,
        width: params.width,
      },
      { headers: this.getRuntimeHeaders(), timeout: 30000 },
    );
    const { jobId } = response.data;

    try {
      const { value } = await this.pollUntilService.poll(
        async () =>
          (
            await axios.get<ManagedImageJob>(`${url}/generate/${jobId}`, {
              headers: this.getRuntimeHeaders(),
              timeout: 10000,
            })
          ).data,
        (job) => {
          if (job.status === 'failed') {
            throw new Error(
              `Images runtime job ${jobId} failed: ${job.error ?? 'no error reported'}`,
            );
          }
          return job.status === 'completed';
        },
        {
          intervalMs: IMAGE_JOB_POLL_INTERVAL_MS,
          timeoutMs: IMAGE_JOB_TIMEOUT_MS,
        },
      );

      if (!value?.resultUrl) {
        throw new Error(`Images runtime job ${jobId} returned no image`);
      }

      return { jobId, resultUrl: value.resultUrl };
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new Error(
          `Images runtime job ${jobId} timed out after ${IMAGE_JOB_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    }
  }

  /** Bearer key the runtimes' internal API key guard expects. */
  private getRuntimeHeaders(): Record<string, string> {
    const apiKey = this.configService.get('GPU_INTERNAL_API_KEY');
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }
}
