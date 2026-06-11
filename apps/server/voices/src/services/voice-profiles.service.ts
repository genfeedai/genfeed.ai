// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { VoiceProfile } from '@voices/interfaces/voices.interfaces';
import { TTSInferenceService } from '@voices/services/tts-inference.service';

/** Voice profiles are durable user data: persisted as one JSON blob, no TTL. */
const VOICE_PROFILES_KEY = 'voices:profiles';

@Injectable()
export class VoiceProfilesService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly profiles: Map<string, VoiceProfile> = new Map();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly ttsInferenceService: TTSInferenceService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const raw = await publisher.get(VOICE_PROFILES_KEY);
      if (!raw) {
        return;
      }

      const persisted = JSON.parse(raw) as Record<string, VoiceProfile>;
      for (const [handle, profile] of Object.entries(persisted)) {
        this.profiles.set(handle, profile);
      }

      this.loggerService.log(caller, {
        count: this.profiles.size,
        message: 'Voice profiles restored from Redis',
      });
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to restore voice profiles from Redis',
      });
    }
  }

  async cloneVoice(params: {
    handle: string;
    audioUrl: string;
    label?: string;
  }): Promise<VoiceProfile> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { handle: params.handle });

    const profile: VoiceProfile = {
      audioUrl: params.audioUrl,
      createdAt: new Date().toISOString(),
      handle: params.handle,
      label: params.label ?? params.handle,
      status: 'cloning',
    };

    this.profiles.set(params.handle, profile);
    await this.persistProfiles();

    // Validate inference container is available
    this.validateClone(params.handle).catch((error) => {
      this.loggerService.error(caller, {
        error,
        handle: params.handle,
        message: 'Voice clone validation failed',
      });
    });

    // Snapshot so async validation cannot mutate the returned status
    return { ...profile };
  }

  private async validateClone(handle: string): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const { status } = await this.ttsInferenceService.getStatus();

      if (status === 'online') {
        // Mark as ready -- the reference audio URL is stored,
        // and voice cloning happens at generation time via reference_audio_path
        const profile = this.profiles.get(handle);
        if (profile) {
          profile.status = 'ready';
          this.profiles.set(handle, profile);
          await this.persistProfiles();
          this.loggerService.log(caller, {
            handle,
            message: 'Voice profile ready',
          });
        }
      } else {
        throw new Error('TTS inference offline');
      }
    } catch (error) {
      const profile = this.profiles.get(handle);
      if (profile) {
        profile.status = 'failed';
        this.profiles.set(handle, profile);
        await this.persistProfiles();
      }
      throw error;
    }
  }

  async listVoices(): Promise<VoiceProfile[]> {
    return Array.from(this.profiles.values());
  }

  async getVoice(handle: string): Promise<VoiceProfile> {
    const profile = this.profiles.get(handle);
    if (!profile) {
      throw new NotFoundException(`Voice profile "${handle}" not found`);
    }
    return profile;
  }

  private async persistProfiles(): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.set(
        VOICE_PROFILES_KEY,
        JSON.stringify(Object.fromEntries(this.profiles)),
      );
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to persist voice profiles to Redis',
      });
    }
  }
}
