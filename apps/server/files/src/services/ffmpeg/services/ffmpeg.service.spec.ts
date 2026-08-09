import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegEffectsService } from '@files/services/ffmpeg/services/ffmpeg-effects.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import { FFmpegTransformService } from '@files/services/ffmpeg/services/ffmpeg-transform.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';

/**
 * FFmpegService is a thin delegation facade over FFmpegCoreService,
 * FFmpegTransformService, FFmpegMergeService, and FFmpegEffectsService.
 * These tests assert every public method forwards its arguments to the
 * correct sub-service and returns that sub-service's result untouched.
 */
describe('FFmpegService', () => {
  let service: FFmpegService;
  let core: Mocked<FFmpegCoreService>;
  let transform: Mocked<FFmpegTransformService>;
  let merge: Mocked<FFmpegMergeService>;
  let effects: Mocked<FFmpegEffectsService>;

  beforeEach(async () => {
    const mockCore = {
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn().mockReturnValue('/tmp/path'),
      getVideoMetadata: vi.fn().mockResolvedValue({ duration: 10 }),
      hasAudioStream: vi.fn().mockResolvedValue(true),
      probe: vi.fn().mockResolvedValue({ duration: 5 }),
    };

    const mockTransform = {
      applyPortraitBlur: vi.fn().mockResolvedValue(undefined),
      compressVideo: vi.fn().mockResolvedValue('/tmp/compressed.mp4'),
      convertToGif: vi.fn().mockResolvedValue(undefined),
      convertToPortrait: vi.fn().mockResolvedValue(undefined),
      convertVideoToAudio: vi.fn().mockResolvedValue(undefined),
      createPortraitWithBlur: vi.fn().mockResolvedValue(undefined),
      extractFrame: vi.fn().mockResolvedValue('/tmp/frame.jpg'),
      mirrorVideo: vi.fn().mockResolvedValue(undefined),
      resizeVideo: vi.fn().mockResolvedValue(undefined),
      reverseVideo: vi.fn().mockResolvedValue(undefined),
      scaleVideo: vi.fn().mockResolvedValue(undefined),
      trimVideo: vi.fn().mockResolvedValue(undefined),
      videoToGif: vi.fn().mockResolvedValue(undefined),
    };

    const mockMerge = {
      concatenateVideos: vi.fn().mockResolvedValue(undefined),
      mergeVideos: vi.fn().mockResolvedValue(undefined),
      mergeVideosWithMusic: vi.fn().mockResolvedValue(undefined),
      mergeVideosWithTransitions: vi.fn().mockResolvedValue(undefined),
    };

    const mockEffects = {
      addAudioAndTextToVideo: vi.fn().mockResolvedValue(undefined),
      addCaptions: vi.fn().mockResolvedValue(undefined),
      addComplexAudioMix: vi.fn().mockResolvedValue(undefined),
      addTextOverlay: vi.fn().mockResolvedValue(undefined),
      createKenBurnsVideoWithTransitions: vi.fn().mockResolvedValue(undefined),
      createSplitScreen: vi.fn().mockResolvedValue(undefined),
      createVerticalSplitScreen: vi.fn().mockResolvedValue(undefined),
      generateKenBurnsSlide: vi.fn().mockResolvedValue(undefined),
      imageToVideoWithKenBurns: vi.fn().mockResolvedValue(undefined),
      overlayAudio: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegService,
        { provide: FFmpegCoreService, useValue: mockCore },
        { provide: FFmpegTransformService, useValue: mockTransform },
        { provide: FFmpegMergeService, useValue: mockMerge },
        { provide: FFmpegEffectsService, useValue: mockEffects },
      ],
    }).compile();

    service = module.get<FFmpegService>(FFmpegService);
    core = module.get(FFmpegCoreService);
    transform = module.get(FFmpegTransformService);
    merge = module.get(FFmpegMergeService);
    effects = module.get(FFmpegEffectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('core delegation', () => {
    it('probe delegates to core', async () => {
      const result = await service.probe('/in.mp4');
      expect(core.probe).toHaveBeenCalledWith('/in.mp4');
      expect(result).toEqual({ duration: 5 });
    });

    it('hasAudioStream delegates to core', async () => {
      const result = await service.hasAudioStream('/in.mp4');
      expect(core.hasAudioStream).toHaveBeenCalledWith('/in.mp4');
      expect(result).toBe(true);
    });

    it('getVideoMetadata delegates to core', async () => {
      const result = await service.getVideoMetadata('/in.mp4');
      expect(core.getVideoMetadata).toHaveBeenCalledWith('/in.mp4');
      expect(result).toEqual({ duration: 10 });
    });

    it('getTempPath delegates to core', () => {
      const result = service.getTempPath('videos', 'ing-1');
      expect(core.getTempPath).toHaveBeenCalledWith('videos', 'ing-1');
      expect(result).toBe('/tmp/path');
    });

    it('cleanupTempFiles delegates to core', async () => {
      await service.cleanupTempFiles('/a.mp4', '/b.mp4');
      expect(core.cleanupTempFiles).toHaveBeenCalledWith('/a.mp4', '/b.mp4');
    });
  });

  describe('transform delegation', () => {
    it('resizeVideo delegates to transform', async () => {
      const onProgress = vi.fn();
      await service.resizeVideo('/in.mp4', '/out.mp4', 1280, 720, onProgress);
      expect(transform.resizeVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        1280,
        720,
        onProgress,
      );
    });

    it('scaleVideo delegates to transform', async () => {
      const dimensions = { height: 720, width: 1280 };
      const options = { crf: '23' };
      await service.scaleVideo('/in.mp4', '/out.mp4', dimensions, options);
      expect(transform.scaleVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        dimensions,
        options,
      );
    });

    it('trimVideo delegates to transform', async () => {
      const onProgress = vi.fn();
      await service.trimVideo('/in.mp4', '/out.mp4', 0, 5, onProgress);
      expect(transform.trimVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        0,
        5,
        onProgress,
      );
    });

    it('compressVideo delegates to transform and returns its result', async () => {
      const onProgress = vi.fn();
      const options = { crf: 28 };
      const result = await service.compressVideo(
        '/in.mp4',
        '/out.mp4',
        options,
        onProgress,
      );
      expect(transform.compressVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        options,
        onProgress,
      );
      expect(result).toBe('/tmp/compressed.mp4');
    });

    it('convertToPortrait delegates to transform', async () => {
      const dimensions = { height: 1920, width: 1080 };
      const onProgress = vi.fn();
      await service.convertToPortrait(
        '/in.mp4',
        '/out.mp4',
        dimensions,
        onProgress,
      );
      expect(transform.convertToPortrait).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        dimensions,
        onProgress,
      );
    });

    it('reverseVideo delegates to transform', async () => {
      const onProgress = vi.fn();
      await service.reverseVideo('/in.mp4', '/out.mp4', onProgress);
      expect(transform.reverseVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        onProgress,
      );
    });

    it('mirrorVideo delegates to transform', async () => {
      const onProgress = vi.fn();
      await service.mirrorVideo('/in.mp4', '/out.mp4', onProgress);
      expect(transform.mirrorVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        onProgress,
      );
    });

    it('applyPortraitBlur delegates to transform', async () => {
      await service.applyPortraitBlur('/in.mp4', '/out.mp4', 15);
      expect(transform.applyPortraitBlur).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        15,
      );
    });

    it('createPortraitWithBlur delegates to transform', async () => {
      const dimensions = { height: 1920, width: 1080 };
      await service.createPortraitWithBlur('/in.mp4', '/out.mp4', dimensions);
      expect(transform.createPortraitWithBlur).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        dimensions,
      );
    });

    it('convertVideoToAudio delegates to transform', async () => {
      const options = { audioCodec: 'aac' };
      await service.convertVideoToAudio('/in.mp4', '/out.mp3', options);
      expect(transform.convertVideoToAudio).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp3',
        options,
      );
    });

    it('extractFrame delegates to transform and returns its result', async () => {
      const result = await service.extractFrame('/in.mp4', '/out.jpg', 2);
      expect(transform.extractFrame).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.jpg',
        2,
      );
      expect(result).toBe('/tmp/frame.jpg');
    });

    it('convertToGif delegates to transform', async () => {
      const options = { fps: 12, width: 480 };
      const onProgress = vi.fn();
      await service.convertToGif('/in.mp4', '/out.gif', options, onProgress);
      expect(transform.convertToGif).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.gif',
        options,
        onProgress,
      );
    });

    it('videoToGif delegates to transform', async () => {
      const options = { fps: 10, width: 320 };
      await service.videoToGif('/in.mp4', '/out.gif', options);
      expect(transform.videoToGif).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.gif',
        options,
      );
    });
  });

  describe('merge delegation', () => {
    it('concatenateVideos delegates to merge', async () => {
      const options = { includeAudio: true };
      await service.concatenateVideos(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
      );
      expect(merge.concatenateVideos).toHaveBeenCalledWith(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
      );
    });

    it('mergeVideos delegates to merge', async () => {
      const options = { transition: 'fade' };
      const onProgress = vi.fn();
      await service.mergeVideos(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
      expect(merge.mergeVideos).toHaveBeenCalledWith(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
    });

    it('mergeVideosWithTransitions delegates to merge', async () => {
      const options = { transition: 'fade', transitionDuration: 1 };
      const onProgress = vi.fn();
      await service.mergeVideosWithTransitions(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
      expect(merge.mergeVideosWithTransitions).toHaveBeenCalledWith(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
    });

    it('mergeVideosWithMusic delegates to merge', async () => {
      const options = { musicPath: '/music.mp3', musicVolume: 0.5 };
      const onProgress = vi.fn();
      await service.mergeVideosWithMusic(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
      expect(merge.mergeVideosWithMusic).toHaveBeenCalledWith(
        ['/a.mp4', '/b.mp4'],
        '/out.mp4',
        options,
        onProgress,
      );
    });
  });

  describe('effects delegation', () => {
    it('imageToVideoWithKenBurns delegates to effects', async () => {
      const options = { duration: 3, fps: 30 };
      await service.imageToVideoWithKenBurns('/in.jpg', '/out.mp4', options);
      expect(effects.imageToVideoWithKenBurns).toHaveBeenCalledWith(
        '/in.jpg',
        '/out.mp4',
        options,
      );
    });

    it('generateKenBurnsSlide delegates to effects', async () => {
      const options = {
        dimensions: { height: 1080, width: 1920 },
        duration: 3,
        zoomDirection: 'in',
      };
      await service.generateKenBurnsSlide('/in.jpg', '/out.mp4', options);
      expect(effects.generateKenBurnsSlide).toHaveBeenCalledWith(
        '/in.jpg',
        '/out.mp4',
        options,
      );
    });

    it('createKenBurnsVideoWithTransitions delegates to effects', async () => {
      const options = {
        dimensions: { height: 1080, width: 1920 },
        fps: 30,
        slideTexts: [{ duration: 3 }],
        totalDuration: 3,
        transitionDuration: 1,
      };
      await service.createKenBurnsVideoWithTransitions(
        ['/slide1.jpg'],
        '/out.mp4',
        options,
      );
      expect(effects.createKenBurnsVideoWithTransitions).toHaveBeenCalledWith(
        ['/slide1.jpg'],
        '/out.mp4',
        options,
      );
    });

    it('createSplitScreen delegates to effects', async () => {
      const options = { audioFrom: 'left' as const };
      await service.createSplitScreen('/l.mp4', '/r.mp4', '/out.mp4', options);
      expect(effects.createSplitScreen).toHaveBeenCalledWith(
        '/l.mp4',
        '/r.mp4',
        '/out.mp4',
        options,
      );
    });

    it('createVerticalSplitScreen delegates to effects', async () => {
      const dimensions = { height: 1920, width: 1080 };
      await service.createVerticalSplitScreen(
        '/top.mp4',
        '/bottom.mp4',
        '/out.mp4',
        dimensions,
      );
      expect(effects.createVerticalSplitScreen).toHaveBeenCalledWith(
        '/top.mp4',
        '/bottom.mp4',
        '/out.mp4',
        dimensions,
      );
    });

    it('addTextOverlay delegates to effects', async () => {
      const options = { fontSize: 24 };
      const onProgress = vi.fn();
      await service.addTextOverlay(
        '/in.mp4',
        '/out.mp4',
        'hello',
        options,
        onProgress,
      );
      expect(effects.addTextOverlay).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        'hello',
        options,
        onProgress,
      );
    });

    it('addCaptions delegates to effects', async () => {
      const onProgress = vi.fn();
      await service.addCaptions(
        '/in.mp4',
        '/out.mp4',
        '/captions.srt',
        onProgress,
      );
      expect(effects.addCaptions).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        '/captions.srt',
        onProgress,
      );
    });

    it('addAudioAndTextToVideo delegates to effects', async () => {
      const options = { audioPath: '/audio.mp3' };
      await service.addAudioAndTextToVideo('/in.mp4', '/out.mp4', options);
      expect(effects.addAudioAndTextToVideo).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        options,
      );
    });

    it('addComplexAudioMix delegates to effects', async () => {
      const options = {
        filters: ['loudnorm'],
        musicPath: '/music.mp3',
        slideTexts: [{ duration: 3 }],
        voicePaths: ['/voice1.mp3'],
      };
      await service.addComplexAudioMix('/in.mp4', '/out.mp4', options);
      expect(effects.addComplexAudioMix).toHaveBeenCalledWith(
        '/in.mp4',
        '/out.mp4',
        options,
      );
    });

    it('overlayAudio delegates to effects', async () => {
      const options = { mixMode: 'mix' as const };
      const onProgress = vi.fn();
      await service.overlayAudio(
        '/in.mp4',
        '/audio.mp3',
        '/out.mp4',
        options,
        onProgress,
      );
      expect(effects.overlayAudio).toHaveBeenCalledWith(
        '/in.mp4',
        '/audio.mp3',
        '/out.mp4',
        options,
        onProgress,
      );
    });
  });
});
