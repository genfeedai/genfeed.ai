import { ConfigService } from '@files/config/config.service';
import { FFmpegConfigService } from '@files/services/ffmpeg/config/ffmpeg.config';
import { Test, type TestingModule } from '@nestjs/testing';

describe('FFmpegConfigService', () => {
  let service: FFmpegConfigService;
  let configService: { get: ReturnType<typeof vi.fn> };

  async function build(values: Record<string, string> = {}) {
    configService = { get: vi.fn((key: string) => values[key]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegConfigService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<FFmpegConfigService>(FFmpegConfigService);
  }

  it('should be defined', async () => {
    await build();
    expect(service).toBeDefined();
  });

  describe('with no environment overrides', () => {
    beforeEach(async () => {
      await build();
    });

    it('falls back to default values for every field', () => {
      expect(service.defaultVideoCodec).toBe('libx264');
      expect(service.defaultAudioCodec).toBe('aac');
      expect(service.defaultCrf).toBe('23');
      expect(service.defaultPreset).toBe('medium');
      expect(service.defaultPixelFormat).toBe('yuv420p');
      expect(service.processTimeout).toBe(300_000);
      expect(service.maxConcurrentProcesses).toBe(3);
      expect(service.tempDirectory).toBe('./tmp');
    });

    it('builds a config object from the same defaults', () => {
      expect(service.config).toEqual({
        defaultAudioCodec: 'aac',
        defaultCrf: '23',
        defaultPixelFormat: 'yuv420p',
        defaultPreset: 'medium',
        defaultVideoCodec: 'libx264',
        maxConcurrentProcesses: 3,
        processTimeout: 300_000,
        tempDirectory: './tmp',
      });
    });
  });

  describe('with environment overrides', () => {
    beforeEach(async () => {
      await build({
        FFMPEG_AUDIO_CODEC: 'opus',
        FFMPEG_CRF: '18',
        FFMPEG_MAX_PROCESSES: '8',
        FFMPEG_PIXEL_FORMAT: 'yuv444p',
        FFMPEG_PRESET: 'fast',
        FFMPEG_TEMP_DIR: '/custom/tmp',
        FFMPEG_TIMEOUT: '60000',
        FFMPEG_VIDEO_CODEC: 'libx265',
      });
    });

    it('uses the configured values for every field', () => {
      expect(service.defaultVideoCodec).toBe('libx265');
      expect(service.defaultAudioCodec).toBe('opus');
      expect(service.defaultCrf).toBe('18');
      expect(service.defaultPreset).toBe('fast');
      expect(service.defaultPixelFormat).toBe('yuv444p');
      expect(service.processTimeout).toBe(60000);
      expect(service.maxConcurrentProcesses).toBe(8);
      expect(service.tempDirectory).toBe('/custom/tmp');
    });

    it('builds a config object from the configured values', () => {
      expect(service.config).toEqual({
        defaultAudioCodec: 'opus',
        defaultCrf: '18',
        defaultPixelFormat: 'yuv444p',
        defaultPreset: 'fast',
        defaultVideoCodec: 'libx265',
        maxConcurrentProcesses: 8,
        processTimeout: 60000,
        tempDirectory: '/custom/tmp',
      });
    });
  });
});
