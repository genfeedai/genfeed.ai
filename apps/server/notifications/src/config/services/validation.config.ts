import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';

export interface ValidationConfig {
  maxFileSize: number;
  allowedVideoFormats: string[];
  allowedImageFormats: string[];
  allowedAudioFormats: string[];
}

const DEFAULT_VIDEO_FORMATS = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
const DEFAULT_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const DEFAULT_AUDIO_FORMATS = ['mp3', 'wav', 'aac', 'flac', 'ogg'];
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

@Injectable()
export class ValidationConfigService {
  private readonly imageMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];
  private readonly videoMimeTypes = [
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-matroska',
    'video/webm',
  ];
  private readonly audioMimeTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/flac',
    'audio/ogg',
  ];

  constructor(private configService: ConfigService) {}

  private parseFormats(
    configKey:
      | 'VALIDATION_VIDEO_FORMATS'
      | 'VALIDATION_IMAGE_FORMATS'
      | 'VALIDATION_AUDIO_FORMATS',
    defaults: string[],
  ): string[] {
    const formats = this.configService.get(configKey);
    if (typeof formats === 'string' && formats.length > 0) {
      return formats.split(',');
    }
    return defaults;
  }

  get config(): ValidationConfig {
    return {
      allowedAudioFormats: this.allowedAudioFormats,
      allowedImageFormats: this.allowedImageFormats,
      allowedVideoFormats: this.allowedVideoFormats,
      maxFileSize: this.maxFileSize,
    };
  }

  get maxFileSize(): number {
    return (
      Number(this.configService.get('VALIDATION_MAX_FILE_SIZE')) ||
      DEFAULT_MAX_FILE_SIZE
    );
  }

  get allowedVideoFormats(): string[] {
    return this.parseFormats('VALIDATION_VIDEO_FORMATS', DEFAULT_VIDEO_FORMATS);
  }

  get allowedImageFormats(): string[] {
    return this.parseFormats('VALIDATION_IMAGE_FORMATS', DEFAULT_IMAGE_FORMATS);
  }

  get allowedAudioFormats(): string[] {
    return this.parseFormats('VALIDATION_AUDIO_FORMATS', DEFAULT_AUDIO_FORMATS);
  }

  get imageMimeTypesArray(): string[] {
    return this.imageMimeTypes;
  }

  get videoMimeTypesArray(): string[] {
    return this.videoMimeTypes;
  }

  get audioMimeTypesArray(): string[] {
    return this.audioMimeTypes;
  }
}
