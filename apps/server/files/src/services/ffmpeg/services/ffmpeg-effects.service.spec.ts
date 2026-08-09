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

  describe('generateKenBurnsSlide()', () => {
    it('builds a zoompan filter with the given options', async () => {
      await service.generateKenBurnsSlide('/tmp/slide.jpg', '/tmp/out.mp4', {
        dimensions: { height: 1080, width: 1920 },
        duration: 3,
        fps: 24,
        zoomDirection: 'zoom=1.1',
        zoomFactor: '1.05',
      });

      expect(coreService.ensureOutputDir).toHaveBeenCalledWith('/tmp/out.mp4');
      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args.find((a) => a.includes('zoompan')) ?? '';
      expect(filterArg).toContain("z='1.05'");
      expect(filterArg).toContain('scale=1920:1080');
      expect(args).toContain('3');
    });

    it('defaults fps to 30 and zoomFactor to 1', async () => {
      await service.generateKenBurnsSlide('/tmp/slide.jpg', '/tmp/out.mp4', {
        dimensions: { height: 1080, width: 1920 },
        duration: 2,
        zoomDirection: 'zoom=1',
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args.find((a) => a.includes('zoompan')) ?? '';
      expect(filterArg).toContain("z='1'");
      expect(filterArg).toContain('fps=30');
    });
  });

  describe('createKenBurnsVideoWithTransitions()', () => {
    it('builds a single-slide filter without transitions', async () => {
      await service.createKenBurnsVideoWithTransitions(
        ['/tmp/slide0.jpg'],
        '/tmp/out.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 3 }],
          totalDuration: 3,
          transitionDuration: 1,
        },
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterArg).toContain('[s0]copy[final];');
    });

    it('builds a multi-slide filter with xfade transitions', async () => {
      await service.createKenBurnsVideoWithTransitions(
        ['/tmp/slide0.jpg', '/tmp/slide1.jpg'],
        '/tmp/out.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 3 }, { duration: 3 }],
          totalDuration: 6,
          transitionDuration: 1,
        },
      );

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterArg).toContain('xfade=transition=circleopen');
      expect(args).toContain('[final]');
    });

    it('uses eased pan/zoom expressions when zoomEaseCurve and configs are provided', async () => {
      await service.createKenBurnsVideoWithTransitions(
        ['/tmp/slide0.jpg'],
        '/tmp/out.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 3 }],
          totalDuration: 3,
          transitionDuration: 1,
          zoomConfigs: [
            {
              endX: 0.8,
              endY: 0.8,
              endZoom: 1.4,
              startX: 0.2,
              startY: 0.2,
              startZoom: 1.0,
            },
          ],
          zoomEaseCurve: 'ease-in-out' as never,
        },
      );

      expect(coreService.executeFFmpeg).toHaveBeenCalled();
    });
  });

  describe('createVerticalSplitScreen()', () => {
    it('stacks top and bottom videos vertically', async () => {
      await service.createVerticalSplitScreen(
        '/tmp/top.mp4',
        '/tmp/bottom.mp4',
        '/tmp/out.mp4',
        { height: 1080, width: 1920 },
      );

      expect(coreService.ensureOutputDir).toHaveBeenCalledWith('/tmp/out.mp4');
      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterArg).toContain('nullsrc=size=1920x2160');
    });
  });

  describe('addAudioAndTextToVideo()', () => {
    it('maps video and audio streams when an audio path is included', async () => {
      await service.addAudioAndTextToVideo('/tmp/in.mp4', '/tmp/out.mp4', {
        audioPath: '/tmp/audio.mp3',
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('/tmp/audio.mp3');
      expect(args).toContain('-shortest');
    });

    it('maps the mix label when a [mix] filter is present', async () => {
      await service.addAudioAndTextToVideo('/tmp/in.mp4', '/tmp/out.mp4', {
        audioPath: '/tmp/audio.mp3',
        filters: ['[0:a][1:a]amix[mix]'],
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('[mix]');
      expect(args).toContain('[vFinal]');
    });

    it('disables audio output when includeAudio is false', async () => {
      await service.addAudioAndTextToVideo('/tmp/in.mp4', '/tmp/out.mp4', {
        audioPath: '/tmp/audio.mp3',
        includeAudio: false,
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('-an');
    });

    it('maps [vFinal] without audio when a video-only filter is present', async () => {
      await service.addAudioAndTextToVideo('/tmp/in.mp4', '/tmp/out.mp4', {
        filters: ['[0:v]scale=100:100[vFinal]'],
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      expect(args).toContain('[vFinal]');
      expect(args).toContain('-an');
    });
  });

  describe('addComplexAudioMix()', () => {
    it('builds a multi-voice mix with delayed tracks', async () => {
      await service.addComplexAudioMix('/tmp/video.mp4', '/tmp/out.mp4', {
        filters: [],
        musicPath: '/tmp/music.mp3',
        slideTexts: [{ duration: 3 }, { duration: 2 }],
        voicePaths: ['/tmp/voice0.mp3', '/tmp/voice1.mp3'],
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterArg).toContain('adelay=0');
      expect(filterArg).toContain('adelay=3000');
      expect(filterArg).toContain('amix=inputs=3');
    });

    it('applies a custom music volume', async () => {
      await service.addComplexAudioMix('/tmp/video.mp4', '/tmp/out.mp4', {
        filters: [],
        musicPath: '/tmp/music.mp3',
        musicVolume: 0.2,
        slideTexts: [{ duration: 1 }],
        voicePaths: ['/tmp/voice0.mp3'],
      });

      const args = coreService.executeFFmpeg.mock.calls[0][0] as string[];
      const filterArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterArg).toContain('volume=0.2[bg]');
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
