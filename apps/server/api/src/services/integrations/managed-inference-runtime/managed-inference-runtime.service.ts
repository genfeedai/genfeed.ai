import {
  SERVER_TOKENS,
  type ServerCustomerInstanceResolver,
} from '@api/server.dependencies';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';

type ManagedInferenceRuntimeRole = 'voices' | 'videos';

interface ManagedVideoParams {
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
}

/**
 * Client for the dedicated media instances behind `provider=genfeedai`.
 *
 * Every call resolves the organization's own running instance and never falls
 * back to a shared URL. A super admin attaches an instance to an organization;
 * Runtime implementations and lifecycle controls live outside this
 * repository.
 */
@Traced()
@Injectable()
export class ManagedInferenceRuntimeService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Inject(SERVER_TOKENS.customerInstances)
    private readonly customerInstancesService: ServerCustomerInstanceResolver,
  ) {}

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
   * The organization's own running instance URL, or null when it has none or
   * the lookup fails.
   */
  private async resolveInstanceUrl(
    organizationId: string,
    role: ManagedInferenceRuntimeRole,
    caller: string,
  ): Promise<string | null> {
    try {
      const instance = await this.customerInstancesService.findRunningForOrg(
        organizationId,
        role,
      );
      return instance?.apiUrl ?? null;
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
   * Proxy POST to the organization's videos instance to generate a video from
   * an image.
   */
  async generateManagedVideoForOrg(
    params: ManagedVideoParams,
  ): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(
      params.organizationId,
      'videos',
      caller,
    );

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Managed videos instance is not enabled for organization',
        organizationId: params.organizationId,
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
   * Proxy POST to the organization's voices instance to generate speech.
   */
  async generateManagedVoiceForOrg(params: {
    organizationId: string;
    text: string;
    voicePreset?: string;
    referenceAudio?: string;
    referenceTranscript?: string;
  }): Promise<{ jobId: string } | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(
      params.organizationId,
      'voices',
      caller,
    );

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Managed voices instance is not enabled for organization',
        organizationId: params.organizationId,
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

  async pollManagedJobForOrg(
    organizationId: string,
    role: ManagedInferenceRuntimeRole,
    jobId: string,
  ): Promise<Record<string, unknown> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = await this.resolveInstanceUrl(organizationId, role, caller);

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
}
