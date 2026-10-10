import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock SecurityUtil
vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    sanitizeCommandArgs: vi.fn((args: string[]) => args),
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
    validateFileSize: vi.fn().mockResolvedValue(undefined),
    validateStringParam: vi.fn((value: string) => value),
  },
}));

// Mock fs.promises
vi.mock('node:fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Use a stable path mock
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    join: vi.fn((...args: string[]) => args.join('/')),
  };
});

describe('FFmpegMergeService', () => {
  let service: FFmpegMergeService;
  let coreService: {
    cleanupTempFiles: ReturnType<typeof vi.fn>;
    ensureOutputDir: ReturnType<typeof vi.fn>;
    executeFFmpeg: ReturnType<typeof vi.fn>;
    getTempPath: ReturnType<typeof vi.fn>;
    hasAudioStream: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const makeProbeResult = (
    duration: number,
    hasAudio = true,
    width = 1080,
    height = 1920,
  ) => ({
    format: { duration: String(duration) },
    streams: [
      { codec_type: 'video', duration: String(duration), height, width },
      ...(hasAudio ? [{ codec_type: 'audio' }] : []),
    ],
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    coreService = {
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      ensureOutputDir: vi.fn().mockResolvedValue(undefined),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn().mockReturnValue('/tmp/merge'),
      hasAudioStream: vi.fn().mockResolvedValue(true),
      probe: vi.fn().mockResolvedValue(makeProbeResult(5)),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegMergeService,
        { provide: FFmpegCoreService, useValue: coreService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<FFmpegMergeService>(FFmpegMergeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mergeNormalizedVideos', () => {
    it('normalizes every generated video/audio stream before ordered concatenation', async () => {
      await service.mergeNormalizedVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        1080,
        1920,
      );
      const args = coreService.executeFFmpeg.mock.calls[0][0];
      expect(args.join(' ')).toContain('scale=1080:1920');
      expect(args.join(' ')).toContain('aresample=48000');
      expect(args.join(' ')).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1');
      expect(args).not.toContain('-t');
      expect(args).not.toContain('-shortest');
    });
    it('normalizes a single scene clip on its own', async () => {
      await service.mergeNormalizedVideos(
        ['/tmp/a.mp4'],
        '/tmp/out.mp4',
        576,
        1024,
      );
      const args = coreService.executeFFmpeg.mock.calls[0][0];
      expect(args.join(' ')).toContain('scale=576:1024');
      expect(args.join(' ')).toContain('[v0][a0]concat=n=1:v=1:a=1');
    });
    it('rejects missing speech audio before FFmpeg output', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(5, false));
      await expect(
        service.mergeNormalizedVideos(
          ['/tmp/a.mp4', '/tmp/b.mp4'],
          '/tmp/out.mp4',
          1080,
          1920,
        ),
      ).rejects.toThrow('speech audio');
      expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
    });
    it('rejects unsafe dimensions rather than stretching or dropping speech', async () => {
      await expect(
        service.mergeNormalizedVideos(
          ['/tmp/a.mp4', '/tmp/b.mp4'],
          '/tmp/out.mp4',
          0,
          1920,
        ),
      ).rejects.toThrow();
      expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
    });
  });

  describe('mergeVideos', () => {
    it('drops the source audio when muting without music', async () => {
      await service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4', {
        muteVideoAudio: true,
      });
      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).toContain('-an');
      expect(args.indexOf('-an')).toBeLessThan(args.indexOf('/tmp/out.mp4'));
    });

    it('keeps the source audio unless muted', async () => {
      await service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4');
      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).not.toContain('-an');
    });

    it('should call executeFFmpeg with concat demuxer args', async () => {
      await service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4');

      expect(coreService.executeFFmpeg).toHaveBeenCalledOnce();
      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).toContain('-f');
      expect(args).toContain('concat');
      expect(args).toContain('-safe');
      expect(args).toContain('0');
    });

    it('should write a temp list file containing input paths', async () => {
      const { promises: fsp } = await import('node:fs');
      await service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4');

      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("file '/tmp/a.mp4'"),
      );
    });

    it('should cleanup the temp list file after execution', async () => {
      await service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4');

      expect(coreService.cleanupTempFiles).toHaveBeenCalledOnce();
    });

    it('should still cleanup temp file even if executeFFmpeg throws', async () => {
      coreService.executeFFmpeg.mockRejectedValue(new Error('ffmpeg died'));

      await expect(
        service.mergeVideos(['/tmp/a.mp4', '/tmp/b.mp4'], '/tmp/out.mp4'),
      ).rejects.toThrow('ffmpeg died');

      expect(coreService.cleanupTempFiles).toHaveBeenCalledOnce();
    });

    it('should pass progress callback to executeFFmpeg when provided', async () => {
      const onProgress = vi.fn();
      await service.mergeVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        undefined,
        onProgress,
      );

      expect(coreService.executeFFmpeg).toHaveBeenCalledWith(
        expect.any(Array),
        onProgress,
      );
    });
  });

  describe('mergeVideosWithMusic', () => {
    it('should call executeFFmpeg with video inputs', async () => {
      await service.mergeVideosWithMusic(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
      );

      expect(coreService.ensureOutputDir).toHaveBeenCalledOnce();
      expect(coreService.executeFFmpeg).toHaveBeenCalledOnce();
    });

    it('should include music input when musicPath is provided', async () => {
      await service.mergeVideosWithMusic(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { musicPath: '/tmp/music.mp3' },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).toContain('/tmp/music.mp3');
    });

    it('should mute video audio when muteVideoAudio=true', async () => {
      await service.mergeVideosWithMusic(['/tmp/a.mp4'], '/tmp/out.mp4', {
        musicPath: '/tmp/bg.mp3',
        muteVideoAudio: true,
      });

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const filterComplexArg = args[args.indexOf('-filter_complex') + 1];
      expect(filterComplexArg).toContain('concat=n=1:v=1:a=0');
    });

    it('should apply default preset and crf values', async () => {
      await service.mergeVideosWithMusic(['/tmp/a.mp4'], '/tmp/out.mp4');

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).toContain('-preset');
      expect(args).toContain('ultrafast');
      expect(args).toContain('-crf');
      expect(args).toContain('23');
    });
  });

  describe('mergeVideosWithTransitions', () => {
    it('should fall back to mergeVideos when fewer than 2 clips', async () => {
      const { promises: fsp } = await import('node:fs');
      await service.mergeVideosWithTransitions(
        ['/tmp/only.mp4'],
        '/tmp/out.mp4',
      );

      // mergeVideos path: writes list file
      expect(fsp.writeFile).toHaveBeenCalled();
    });

    it('should fall back to mergeVideos when transition is "none"', async () => {
      const { promises: fsp } = await import('node:fs');
      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'none' },
      );

      expect(fsp.writeFile).toHaveBeenCalled();
    });

    it('should build xfade filter complex for 2 videos', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(5, false));

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'dissolve', transitionDuration: 0.5 },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fcIdx = args.indexOf('-filter_complex');
      expect(fcIdx).toBeGreaterThanOrEqual(0);
      const filterComplex = args[fcIdx + 1];
      expect(filterComplex).toContain('xfade=transition=dissolve');
    });

    it('normalizes mixed-rate clips before applying transitions', async () => {
      coreService.probe
        .mockResolvedValueOnce({
          ...makeProbeResult(5),
          streams: [
            {
              codec_type: 'video',
              width: 1920,
              height: 1080,
              r_frame_rate: '24/1',
              time_base: '1/12288',
            },
            { codec_type: 'audio' },
          ],
        })
        .mockResolvedValueOnce({
          ...makeProbeResult(3),
          streams: [
            {
              codec_type: 'video',
              width: 1080,
              height: 1920,
              r_frame_rate: '30/1',
              time_base: '1/15360',
            },
            { codec_type: 'audio' },
          ],
        });

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'fade', transitionDuration: 0.5 },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const filter = args[args.indexOf('-filter_complex') + 1];
      for (const index of [0, 1]) {
        // Timestamps restart before the rate conversion: FFmpeg 7 drops the
        // frame rate after setpts and xfade then rejects the input.
        expect(filter).toContain(
          `[${index}:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080`,
        );
        expect(filter).toContain(
          `[${index}:a]asetpts=PTS-STARTPTS,aresample=48000`,
        );
      }
      expect(filter).toContain(
        '[v0][v1]xfade=transition=fade:duration=0.5:offset=4.5[xv1]',
      );
      expect(filter).toContain('[xv1]format=yuv420p[vout]');
      expect(args).toEqual(
        expect.arrayContaining(['-pix_fmt', 'yuv420p', '-movflags']),
      );
    });

    it('places transitions by video length, not a longer audio track', async () => {
      coreService.probe
        .mockResolvedValueOnce({
          format: { duration: '8' },
          streams: [
            { codec_type: 'video', duration: '5', height: 1920, width: 1080 },
            { codec_type: 'audio', duration: '8' },
          ],
        })
        .mockResolvedValueOnce(makeProbeResult(4));

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'fade', transitionDuration: 0.5 },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const filter = args[args.indexOf('-filter_complex') + 1];
      expect(filter).toContain('xfade=transition=fade:duration=0.5:offset=4.5');
      expect(filter).toContain('apad=whole_dur=5,atrim=duration=5[a0]');
    });

    it('rejects a transition as long as a clip instead of truncating the merge', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(1.5));
      await expect(
        service.mergeVideosWithTransitions(
          ['/tmp/a.mp4', '/tmp/b.mp4'],
          '/tmp/out.mp4',
          { transition: 'fade', transitionDuration: 2 },
        ),
      ).rejects.toThrow(
        'Transition duration 2s must be shorter than every clip; clip 1 is 1.5s',
      );
      expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
    });

    it('rejects a failed clip probe without executing a fabricated merge', async () => {
      const error = new Error('Probe failed');
      coreService.probe.mockRejectedValueOnce(error);
      await expect(
        service.mergeVideosWithTransitions(
          ['/tmp/a.mp4', '/tmp/b.mp4'],
          '/tmp/out.mp4',
          { transition: 'fade' },
        ),
      ).rejects.toBe(error);
      expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
    });

    it.each(['NaN', 'Infinity', '0', '-2', '5 invalid', undefined])(
      'rejects invalid clip duration %s without assuming five seconds',
      async (duration) => {
        coreService.probe.mockResolvedValueOnce({
          format: { duration },
          streams: [{ codec_type: 'video', width: 1080, height: 1920 }],
        });
        await expect(
          service.mergeVideosWithTransitions(
            ['/tmp/a.mp4', '/tmp/b.mp4'],
            '/tmp/out.mp4',
            { transition: 'fade' },
          ),
        ).rejects.toThrow('Transition clip 1 has no positive video duration');
        expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
      },
    );

    it('rejects a clip without a video stream', async () => {
      coreService.probe.mockResolvedValueOnce({
        format: { duration: '5' },
        streams: [{ codec_type: 'audio' }],
      });
      await expect(
        service.mergeVideosWithTransitions(
          ['/tmp/a.mp4', '/tmp/b.mp4'],
          '/tmp/out.mp4',
          { transition: 'fade' },
        ),
      ).rejects.toThrow('Transition clip 1 has no video stream');
      expect(coreService.executeFFmpeg).not.toHaveBeenCalled();
    });

    it('drops clip audio from a muted transition merge', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(5, true));

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { muteVideoAudio: true, transition: 'fade' },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain('xfade=transition=fade');
      expect(fc).not.toContain('acrossfade');
      expect(args).not.toContain('[aout]');
      expect(args).toContain('-an');
    });

    it('mutes a single-clip transition merge through the concat fallback', async () => {
      await service.mergeVideosWithTransitions(
        ['/tmp/only.mp4'],
        '/tmp/out.mp4',
        {
          muteVideoAudio: true,
          transition: 'fade',
        },
      );
      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      expect(args).toContain('-an');
    });

    it('should include audio crossfade when clips have audio', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(5, true));

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'fade' },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain('acrossfade');
    });

    it('should log debug message with transition details', async () => {
      coreService.probe.mockResolvedValue(makeProbeResult(5, false));

      await service.mergeVideosWithTransitions(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { transition: 'wipeleft' },
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.stringContaining('wipeleft'),
        expect.any(Object),
      );
    });
  });

  describe('concatenateVideos', () => {
    it('should validate each input path via SecurityUtil', async () => {
      const { SecurityUtil } = await import(
        '@files/helpers/utils/security/security.util'
      );

      await service.concatenateVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
      );

      expect(SecurityUtil.validateFilePath).toHaveBeenCalledTimes(3); // 2 inputs + 1 output
    });

    it('should call executeFFmpeg with filter_complex concat', async () => {
      await service.concatenateVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain('concat=n=2');
    });

    it('should include audio streams in concat when present', async () => {
      coreService.hasAudioStream.mockResolvedValue(true);

      await service.concatenateVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { includeAudio: true },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain(':a=1');
    });

    it('should build video-only concat when includeAudio is false', async () => {
      await service.concatenateVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { includeAudio: false },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain(':a=0');
    });

    it('should insert silent audio for clips missing audio track', async () => {
      coreService.hasAudioStream
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      coreService.probe.mockResolvedValue(makeProbeResult(3, false));

      await service.concatenateVideos(
        ['/tmp/a.mp4', '/tmp/b.mp4'],
        '/tmp/out.mp4',
        { includeAudio: true },
      );

      const [args] = coreService.executeFFmpeg.mock.calls[0] as [string[]];
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain('aevalsrc=0');
    });
  });
});
