import { ConfigService } from '@api/config/config.service';
import { ValidationConfigService } from '@api/config/services/validation.config';

type ValidationConfigKeys =
  | 'VALIDATION_MAX_FILE_SIZE'
  | 'VALIDATION_VIDEO_FORMATS'
  | 'VALIDATION_IMAGE_FORMATS'
  | 'VALIDATION_AUDIO_FORMATS';

describe('ValidationConfigService', () => {
  const createService = (
    values: Partial<Record<ValidationConfigKeys, string>>,
  ) => {
    const getMock = vi.fn(
      (key: keyof any) => values[key as ValidationConfigKeys],
    );
    const configService = { get: getMock } as unknown as ConfigService;

    return { getMock, service: new ValidationConfigService(configService) };
  };

  it('returns default limits and formats when overrides are not provided', () => {
    const { service, getMock } = createService({});

    expect(service.maxFileSize).toBe(100 * 1024 * 1024);
    expect(service.allowedVideoFormats).toEqual([
      'mp4',
      'avi',
      'mov',
      'mkv',
      'webm',
    ]);
    expect(service.allowedImageFormats).toEqual([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
    ]);
    expect(service.allowedAudioFormats).toEqual([
      'mp3',
      'wav',
      'aac',
      'flac',
      'ogg',
      'webm',
    ]);
    expect(service.getMaxFileSize()).toBe(100 * 1024 * 1024);
    expect(service.getAllowedImageExtensions()).toEqual([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
    ]);
    expect(service.getAllowedVideoExtensions()).toEqual([
      'mp4',
      'avi',
      'mov',
      'mkv',
      'webm',
    ]);
    expect(service.getAllowedAudioExtensions()).toEqual([
      'mp3',
      'wav',
      'aac',
      'flac',
      'ogg',
      'webm',
    ]);

    expect(getMock).toHaveBeenCalledWith('VALIDATION_MAX_FILE_SIZE');
    expect(getMock).toHaveBeenCalledWith('VALIDATION_VIDEO_FORMATS');
    expect(getMock).toHaveBeenCalledWith('VALIDATION_IMAGE_FORMATS');
    expect(getMock).toHaveBeenCalledWith('VALIDATION_AUDIO_FORMATS');
  });

  it('parses configuration overrides from the ConfigService', () => {
    const overrides: Record<ValidationConfigKeys, string> = {
      VALIDATION_AUDIO_FORMATS: 'mp3,wav,aiff',
      VALIDATION_IMAGE_FORMATS: 'jpg,png,avif',
      VALIDATION_MAX_FILE_SIZE: String(50 * 1024 * 1024),
      VALIDATION_VIDEO_FORMATS: 'mp4,webm',
    };
    const { service } = createService(overrides);

    expect(service.config).toEqual({
      allowedAudioFormats: ['mp3', 'wav', 'aiff'],
      allowedImageFormats: ['jpg', 'png', 'avif'],
      allowedVideoFormats: ['mp4', 'webm'],
      maxFileSize: 50 * 1024 * 1024,
    });
  });

  it('exposes fixed MIME type allow-lists', () => {
    const { service } = createService({});

    expect(service.getAllowedImageMimeTypes()).toEqual([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    expect(service.getAllowedVideoMimeTypes()).toEqual([
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
    ]);
    expect(service.getAllowedAudioMimeTypes()).toEqual([
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/aac',
      'audio/flac',
      'audio/ogg',
      'audio/webm',
    ]);
  });
});
