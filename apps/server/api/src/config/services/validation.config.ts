import { ConfigService } from '@api/config/config.service';
import { Injectable } from '@nestjs/common';

export interface ValidationConfig {
  maxFileSize: number;
  allowedVideoFormats: string[];
  allowedImageFormats: string[];
  allowedAudioFormats: string[];
}

@Injectable()
export class ValidationConfigService {
  constructor(private configService: ConfigService) {}

  get config(): ValidationConfig {
    const videoFormats = this.configService.get('VALIDATION_VIDEO_FORMATS');
    const imageFormats = this.configService.get('VALIDATION_IMAGE_FORMATS');
    const audioFormats = this.configService.get('VALIDATION_AUDIO_FORMATS');

    return {
      allowedAudioFormats: (typeof audioFormats === 'string'
        ? audioFormats.split(',')
        : undefined) || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
      allowedImageFormats: (typeof imageFormats === 'string'
        ? imageFormats.split(',')
        : undefined) || ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      allowedVideoFormats: (typeof videoFormats === 'string'
        ? videoFormats.split(',')
        : undefined) || ['mp4', 'avi', 'mov', 'mkv', 'webm'],
      maxFileSize:
        Number(this.configService.get('VALIDATION_MAX_FILE_SIZE')) ||
        100 * 1024 * 1024, // 100MB
    };
  }

  get maxFileSize(): number {
    return (
      Number(this.configService.get('VALIDATION_MAX_FILE_SIZE')) ||
      100 * 1024 * 1024
    );
  }

  get allowedVideoFormats(): string[] {
    const formats = this.configService.get('VALIDATION_VIDEO_FORMATS');
    return (
      (typeof formats === 'string' ? formats.split(',') : undefined) || [
        'mp4',
        'avi',
        'mov',
        'mkv',
        'webm',
      ]
    );
  }

  get allowedImageFormats(): string[] {
    const formats = this.configService.get('VALIDATION_IMAGE_FORMATS');
    return (
      (typeof formats === 'string' ? formats.split(',') : undefined) || [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif',
      ]
    );
  }

  get allowedAudioFormats(): string[] {
    const formats = this.configService.get('VALIDATION_AUDIO_FORMATS');
    return (
      (typeof formats === 'string' ? formats.split(',') : undefined) || [
        'mp3',
        'wav',
        'aac',
        'flac',
        'ogg',
        'webm',
      ]
    );
  }

  getMaxFileSize(): number {
    return this.maxFileSize;
  }

  getAllowedImageMimeTypes(): string[] {
    return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  }

  getAllowedImageExtensions(): string[] {
    return this.allowedImageFormats;
  }

  getAllowedVideoMimeTypes(): string[] {
    return [
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
    ];
  }

  getAllowedVideoExtensions(): string[] {
    return this.allowedVideoFormats;
  }

  getAllowedAudioMimeTypes(): string[] {
    return [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/aac',
      'audio/flac',
      'audio/ogg',
      'audio/webm',
    ];
  }

  getAllowedAudioExtensions(): string[] {
    return this.allowedAudioFormats;
  }
}
