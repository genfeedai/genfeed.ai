import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock SecurityUtil before imports
vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    sanitizeCommandArgs: vi.fn((args: string[]) => args),
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
    validateFileSize: vi.fn().mockResolvedValue(undefined),
    validateNumericParam: vi.fn((value: number) => Math.floor(value)),
  },
}));

// Mock ease-curves helper
vi.mock('@files/services/ffmpeg/helpers/ease-curves.helper', () => ({
  getPanExpression: vi.fn(() => 'iw*0.5'),
  getZoomExpression: vi.fn(() => '1+0.1*t'),
}));

import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegEffectsService } from '@files/services/ffmpeg/services/ffmpeg-effects.service';

describe('FFmpegEffectsService', () => {
  let service: FFmpegEffectsService;
  let coreService: {
    executeFFmpeg: ReturnType<typeof vi.fn>;
    ensureOutputDir: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    coreService = {
      ensureOutputDir: vi.fn().mockResolvedValue(undefined),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegEffectsService,
        { provide: FFmpegCoreService, useValue: coreService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(FFmpegEffectsService);
  });

  describe('imageToVideoWithKenBurns()', () => {
    it('calls executeFFmpeg with correct args for default options', async () => {
      await service.imageToVideoWithKenBurns(
        '/tmp/input.jpg',
        '/tmp/output.mp4',
      );

      expect(coreService.ensureOutputDir).toHaveBeenCalledWith(
        '/tmp/output.mp4',
      );
      expect(coreService.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining(['-loop', '1', '-i', '/tmp/input.jpg']),
      );
    });

    it('includes zoom factor in filter expression', async () => {
      await service.imageToVideoWithKenBurns(
        '/tmp/input.jpg',
        '/tmp/output.mp4',
        { zoom: 1.2 },
      );

      const callArgs = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const vfIndex = callArgs.indexOf('-vf');
      expect(vfIndex).toBeGreaterThan(-1);
      expect(callArgs[vfIndex + 1]).toContain('zoompan');
    });

    it('passes custom duration and fps', async () => {
      await service.imageToVideoWithKenBurns(
        '/tmp/input.jpg',
        '/tmp/output.mp4',
        { duration: 5, fps: 24 },
      );

      const callArgs = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(callArgs).toContain('5');
      expect(callArgs).toContain('24');
    });
  });

  describe('createSplitScreen()', () => {
    it('calls executeFFmpeg with hstack filter', async () => {
      await service.createSplitScreen(
        '/tmp/left.mp4',
        '/tmp/right.mp4',
        '/tmp/out.mp4',
      );

      expect(coreService.executeFFmpeg).toHaveBeenCalled();
      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterIdx = args.indexOf('-filter_complex');
      expect(filterIdx).toBeGreaterThan(-1);
      expect(args[filterIdx + 1]).toContain('hstack');
    });

    it('maps audio from left by default', async () => {
      await service.createSplitScreen(
        '/tmp/left.mp4',
        '/tmp/right.mp4',
        '/tmp/out.mp4',
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      // default audioFrom='left' → '-map 0:a?'
      expect(args).toContain('0:a?');
    });

    it('maps audio from right when audioFrom is right', async () => {
      await service.createSplitScreen(
        '/tmp/left.mp4',
        '/tmp/right.mp4',
        '/tmp/out.mp4',
        { audioFrom: 'right' },
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('1:a?');
    });

    it('ensures output directory is created', async () => {
      await service.createSplitScreen(
        '/tmp/left.mp4',
        '/tmp/right.mp4',
        '/tmp/output/split.mp4',
      );

      expect(coreService.ensureOutputDir).toHaveBeenCalledWith(
        '/tmp/output/split.mp4',
      );
    });
  });

  describe('addTextOverlay()', () => {
    it('calls executeFFmpeg with drawtext filter', async () => {
      await service.addTextOverlay(
        '/tmp/input.mp4',
        '/tmp/output.mp4',
        'Hello World',
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterIdx = args.indexOf('-vf');
      expect(filterIdx).toBeGreaterThan(-1);
      expect(args[filterIdx + 1]).toContain('drawtext');
    });

    it('includes the provided text in the filter', async () => {
      await service.addTextOverlay(
        '/tmp/input.mp4',
        '/tmp/output.mp4',
        'My Caption',
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args.find((a) => a.includes('drawtext')) ?? '';
      expect(filterArg).toContain('My Caption');
    });

    it('uses center position by default', async () => {
      await service.addTextOverlay('/tmp/input.mp4', '/tmp/output.mp4', 'Test');

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args.find((a) => a.includes('drawtext')) ?? '';
      expect(filterArg).toContain('(h-text_h)/2');
    });

    it('uses top position when specified', async () => {
      await service.addTextOverlay(
        '/tmp/input.mp4',
        '/tmp/output.mp4',
        'Top Text',
        { position: 'top' },
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args.find((a) => a.includes('drawtext')) ?? '';
      expect(filterArg).toContain('y=50');
    });
  });

  describe('addCaptions()', () => {
    it('calls executeFFmpeg with caption streams', async () => {
      await service.addCaptions(
        '/tmp/input.mp4',
        '/tmp/output.mp4',
        '/tmp/captions.srt',
      );

      expect(coreService.executeFFmpeg).toHaveBeenCalled();
      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('/tmp/captions.srt');
      expect(args).toContain('mov_text');
    });
  });

  describe('overlayAudio()', () => {
    it('uses replace mode to substitute audio', async () => {
      await service.overlayAudio(
        '/tmp/video.mp4',
        '/tmp/audio.mp3',
        '/tmp/out.mp4',
        { mixMode: 'replace' },
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterIdx = args.indexOf('-filter_complex');
      expect(filterIdx).toBeGreaterThan(-1);
      expect(args[filterIdx + 1]).toContain('volume=');
    });

    it('calls ensureOutputDir with output path', async () => {
      await service.overlayAudio(
        '/tmp/video.mp4',
        '/tmp/audio.mp3',
        '/tmp/out/result.mp4',
        { mixMode: 'replace' },
      );

      expect(coreService.ensureOutputDir).toHaveBeenCalledWith(
        '/tmp/out/result.mp4',
      );
    });

    it('logs the overlay mode and volume settings', async () => {
      await service.overlayAudio(
        '/tmp/video.mp4',
        '/tmp/audio.mp3',
        '/tmp/out.mp4',
        { audioVolume: 80, mixMode: 'mix', videoVolume: 60 },
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('mode=mix'),
      );
    });
  });
});
