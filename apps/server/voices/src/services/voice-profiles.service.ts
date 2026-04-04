import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { VoiceProfile } from '@voices/interfaces/voices.interfaces';
import { TTSInferenceService } from '@voices/services/tts-inference.service';

@Injectable()
export class VoiceProfilesService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly profiles: Map<string, VoiceProfile> = new Map();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly ttsInferenceService: TTSInferenceService,
  ) {}

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

    // Validate inference container is available
    this.validateClone(params.handle).catch((error) => {
      this.loggerService.error(caller, {
        error,
        handle: params.handle,
        message: 'Voice clone validation failed',
      });
    });

    return profile;
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
}
