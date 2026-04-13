import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { ConfigService } from '@api/config/config.service';
import type {
  IFleetHealthResponse,
  IFleetInstance,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

type FleetRole = 'images' | 'voices' | 'videos';

interface GpuInstance {
  name: string;
  subdomain: string;
  apiUrl: string;
  isConfigured: boolean;
}

@Injectable()
export class FleetService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly instances: Map<FleetRole, GpuInstance>;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly customerInstancesService: CustomerInstancesService,
  ) {
    this.instances = new Map<FleetRole, GpuInstance>([
      [
        'images',
        {
          apiUrl: this.configService.get('GPU_IMAGES_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_IMAGES_URL')),
          name: 'images',
          subdomain: 'images.genfeed.ai',
        },
      ],
      [
        'voices',
        {
          apiUrl: this.configService.get('GPU_VOICES_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_VOICES_URL')),
          name: 'voices',
          subdomain: 'voices.genfeed.ai',
        },
      ],
      [
        'videos',
        {
          apiUrl: this.configService.get('GPU_VIDEOS_URL') || '',
          isConfigured: Boolean(this.configService.get('GPU_VIDEOS_URL')),
          name: 'videos',
          subdomain: 'videos.genfeed.ai',
        },
      ],
    ]);
  }

  /**
   * Resolve the API URL for a given org + fleet role.
   * Returns the org's dedicated instance URL if one is running,
   * otherwise falls back to the shared fleet URL from config.
   */
  async getInstanceUrlForOrg(
    organizationId: string,
    role: FleetRole,
  ): Promise<string | null> {
    const dedicated = await this.customerInstancesService.findRunningForOrg(
      organizationId,
      role,
    );

    if (dedicated) {
      return dedicated.apiUrl;
    }

    return this.getInstanceUrl(role);
  }

  /**
   * Get the API URL for a fleet instance, or null if not configured.
   */
  getInstanceUrl(role: FleetRole): string | null {
    const instance = this.instances.get(role);
    if (!instance?.isConfigured || !instance.apiUrl) {
      return null;
    }
    return instance.apiUrl;
  }

  private async resolveInstanceUrl(
    role: FleetRole,
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
   * Check if a fleet instance is available (configured + responds to health check).
   */
  async isAvailable(role: FleetRole): Promise<boolean> {
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
        message: `Fleet instance ${role} is not available`,
        url,
      });
      return false;
    }
  }

  /**
   * Get health status of all fleet instances.
   */
  async getFleetHealth(): Promise<IFleetHealthResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    const roles: FleetRole[] = ['images', 'voices', 'videos'];

    const instances: IFleetInstance[] = await Promise.all(
      roles.map(async (role) => {
        const instance = this.instances.get(role);
        const lastChecked = new Date().toISOString();

        if (!instance?.isConfigured || !instance.apiUrl) {
          return {
            lastChecked,
            name: instance?.subdomain ?? `${role}.genfeed.ai`,
            role,
            status: 'unconfigured' as const,
            url: '',
          };
        }

        try {
          const start = Date.now();
          const response = await axios.get(`${instance.apiUrl}/v1/health`, {
            timeout: 5000,
          });
          const responseTimeMs = Date.now() - start;

          return {
            health: response.data,
            lastChecked,
            name: instance.subdomain,
            responseTimeMs,
            role,
            status: 'online' as const,
            url: instance.apiUrl,
          };
        } catch {
          return {
            lastChecked,
            name: instance.subdomain,
            role,
            status: 'offline' as const,
            url: instance.apiUrl,
          };
        }
      }),
    );

    return {
      instances,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Shorthand to get the videos instance URL.
   */
  getVideosUrl(): string | null {
    return this.getInstanceUrl('videos');
  }

  /**
   * Shorthand to get the voices instance URL.
   */
  getVoicesUrl(): string | null {
    return this.getInstanceUrl('voices');
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
   * Poll job status on any fleet instance.
   */
  async pollJob(
    role: FleetRole,
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
   * Get all voice profiles from the self-hosted voices instance.
   */
  async getVoiceProfiles(): Promise<Array<{
    handle: string;
    label: string;
    sampleUrl?: string;
  }> | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const url = this.getInstanceUrl('voices');

    if (!url) {
      this.loggerService.warn(caller, {
        message: 'Voices instance not configured',
      });
      return null;
    }

    try {
      const response = await axios.get(`${url}/voices`, { timeout: 10000 });
      return response.data.voices ?? response.data;
    } catch (error) {
      this.loggerService.error(caller, {
        error,
        message: 'Failed to get voice profiles',
      });
      return null;
    }
  }

  /**
   * Get all configured fleet instances (for admin UI).
   */
  getAllInstances(): GpuInstance[] {
    return Array.from(this.instances.values());
  }
}
