import { ConfigService } from '@files/config/config.service';
import { Injectable } from '@nestjs/common';

export interface FFmpegConfig {
  defaultVideoCodec: string;
  defaultAudioCodec: string;
  defaultCrf: string;
  defaultPreset: string;
  defaultPixelFormat: string;
  processTimeout: number;
  maxConcurrentProcesses: number;
  tempDirectory: string;
}

@Injectable()
export class FFmpegConfigService {
  constructor(private configService: ConfigService) {}

  get config(): FFmpegConfig {
    return {
      defaultAudioCodec: this.configService.get('FFMPEG_AUDIO_CODEC') || 'aac',
      defaultCrf: this.configService.get('FFMPEG_CRF') || '23',
      defaultPixelFormat:
        this.configService.get('FFMPEG_PIXEL_FORMAT') || 'yuv420p',
      defaultPreset: this.configService.get('FFMPEG_PRESET') || 'medium',
      defaultVideoCodec:
        this.configService.get('FFMPEG_VIDEO_CODEC') || 'libx264',
      maxConcurrentProcesses:
        Number(this.configService.get('FFMPEG_MAX_PROCESSES')) || 3,
      processTimeout:
        Number(this.configService.get('FFMPEG_TIMEOUT')) || 300_000, // 5 minutes
      tempDirectory: this.configService.get('FFMPEG_TEMP_DIR') || './tmp',
    };
  }

  get defaultVideoCodec(): string {
    return this.configService.get('FFMPEG_VIDEO_CODEC') || 'libx264';
  }

  get defaultAudioCodec(): string {
    return this.configService.get('FFMPEG_AUDIO_CODEC') || 'aac';
  }

  get defaultCrf(): string {
    return this.configService.get('FFMPEG_CRF') || '23';
  }

  get defaultPreset(): string {
    return this.configService.get('FFMPEG_PRESET') || 'medium';
  }

  get defaultPixelFormat(): string {
    return this.configService.get('FFMPEG_PIXEL_FORMAT') || 'yuv420p';
  }

  get processTimeout(): number {
    return Number(this.configService.get('FFMPEG_TIMEOUT')) || 300_000;
  }

  get maxConcurrentProcesses(): number {
    return Number(this.configService.get('FFMPEG_MAX_PROCESSES')) || 3;
  }

  get tempDirectory(): string {
    return this.configService.get('FFMPEG_TEMP_DIR') || './tmp';
  }
}
