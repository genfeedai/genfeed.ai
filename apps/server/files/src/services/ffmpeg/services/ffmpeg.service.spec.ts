import type { MockedFunction } from 'vitest';
/// <reference types="node" />

import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  constants: {
    R_OK: 4,
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1024 }),
    unlink: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock SecurityUtil
vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    sanitizeCommandArgs: vi.fn((args: string[]) => args),
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((path: string) => path),
    validateFileSize: vi.fn().mockResolvedValue(undefined),
    validateNumericParam: vi.fn((value: number) => Math.floor(value)),
    validateStringParam: vi.fn((value: string) => value),
  },
}));

// Mock ease-curves helper
vi.mock('@files/services/ffmpeg/helpers/ease-curves.helper', () => ({
  getPanExpression: vi.fn(() => 'iw*(0.5+0.1*t)'),
  getZoomExpression: vi.fn(() => '1+0.1*t'),
}));

// Get the mocked spawn
import { spawn } from 'node:child_process';

const mockSpawn = spawn as MockedFunction<typeof spawn>;

// Mock logger service
const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
};

// Mock binary validation service
const mockBinaryValidationService = {
  getBinaryPaths: vi.fn().mockReturnValue({
    ffmpegPath: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
  }),
  validateBinaries: vi.fn().mockResolvedValue(undefined),
};

describe('FFmpegService', () => {
  let service: FFmpegService;

  // Helper to create a mock child process
  const createMockProcess = (
    exitCode: number = 0,
    stdout: string = '',
    stderr: string = '',
  ) => {
    const process: any = {
      kill: vi.fn(),
      on: vi.fn((event: string, callback: (arg?: any) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(exitCode), 20);
        }
        if (event === 'error' && exitCode !== 0) {
          setTimeout(() => callback(new Error('Process error')), 20);
        }
        return process;
      }),
      stderr: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && stderr) {
            setTimeout(() => callback(Buffer.from(stderr)), 10);
          }
          return process.stderr;
        }),
      },
      stdout: {
        on: vi.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && stdout) {
            setTimeout(() => callback(Buffer.from(stdout)), 10);
          }
          return process.stdout;
        }),
      },
    };
    return process;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset static state on BinaryValidationService
    (BinaryValidationService as any).validated = true;
    (BinaryValidationService as any).validationPromise = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: BinaryValidationService,
          useValue: mockBinaryValidationService,
        },
      ],
    }).compile();

    service = module.get<FFmpegService>(FFmpegService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should validate binaries on initialization', () => {
      expect(mockBinaryValidationService.validateBinaries).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // probe() Tests
  // ==========================================================================
  describe('probe', () => {
    it('should probe media file successfully', async () => {
      const mockProbeData = {
        format: {
          bit_rate: '1000000',
          duration: '10.5',
          filename: '/test.mp4',
          size: '1000000',
        },
        streams: [
          { codec_type: 'video', height: 1080, index: 0, width: 1920 },
          { codec_type: 'audio', index: 1 },
        ],
      };

      const mockProcess = createMockProcess(0, JSON.stringify(mockProbeData));
      mockSpawn.mockReturnValue(mockProcess);

      const result = await service.probe('/test.mp4');

      expect(result).toEqual(mockProbeData);
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffprobe',
        expect.arrayContaining([
          '-v',
          'quiet',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          '/test.mp4',
        ]),
      );
    });

    it('should handle probe failure', async () => {
      const mockProcess = createMockProcess(1, '', 'Error probing file');
      mockSpawn.mockReturnValue(mockProcess);

      await expect(service.probe('/test.mp4')).rejects.toThrow(
        'FFprobe exited with code 1',
      );
    });

    it('should handle invalid JSON output', async () => {
      const mockProcess = createMockProcess(0, 'invalid json');
      mockSpawn.mockReturnValue(mockProcess);

      await expect(service.probe('/test.mp4')).rejects.toThrow(
        'Failed to parse ffprobe output',
      );
    });
  });

  // ==========================================================================
  // convertVideoToAudio() Tests
  // ==========================================================================
  describe('convertVideoToAudio', () => {
    it('should convert video to audio successfully', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertVideoToAudio('/input.mp4', '/output.mp3');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-i',
          '/input.mp4',
          '-vn',
          '-acodec',
          'libmp3lame',
          '-ab',
          '128k',
          '-f',
          'mp3',
          '-y',
          '/output.mp3',
        ]),
      );
    });

    it('should use custom options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertVideoToAudio('/input.mp4', '/output.wav', {
        audioBitrate: '256k',
        audioCodec: 'pcm_s16le',
        format: 'wav',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-acodec',
          'pcm_s16le',
          '-ab',
          '256k',
          '-f',
          'wav',
        ]),
      );
    });

    it('should handle FFmpeg errors', async () => {
      const mockProcess = createMockProcess(1, '', 'Error converting');
      mockSpawn.mockReturnValue(mockProcess);

      await expect(
        service.convertVideoToAudio('/input.mp4', '/output.mp3'),
      ).rejects.toThrow('FFmpeg exited with code 1');
    });
  });

  // ==========================================================================
  // hasAudioStream() Tests
  // ==========================================================================
  describe('hasAudioStream', () => {
    it('should return true if audio stream exists', async () => {
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: {},
        streams: [{ codec_type: 'video' }, { codec_type: 'audio' }],
      } as any);

      const result = await service.hasAudioStream('/test.mp4');
      expect(result).toBe(true);
    });

    it('should return false if no audio stream exists', async () => {
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: {},
        streams: [{ codec_type: 'video' }],
      } as any);

      const result = await service.hasAudioStream('/test.mp4');
      expect(result).toBe(false);
    });

    it('should return false on probe error', async () => {
      vi.spyOn(service, 'probe').mockRejectedValue(new Error('Probe failed'));

      const result = await service.hasAudioStream('/test.mp4');
      expect(result).toBe(false);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // concatenateVideos() Tests
  // ==========================================================================
  describe('concatenateVideos', () => {
    it('should concatenate videos with audio', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);
      vi.spyOn(service, 'hasAudioStream').mockResolvedValue(true);
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: { duration: '5' },
        streams: [{ codec_type: 'video', duration: '5' }],
      } as any);

      await service.concatenateVideos(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex']),
      );
    });

    it('should concatenate videos without audio', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);
      vi.spyOn(service, 'hasAudioStream').mockResolvedValue(false);
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: {},
        streams: [{ codec_type: 'video' }],
      } as any);

      await service.concatenateVideos(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {
          includeAudio: false,
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should use custom codecs', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);
      vi.spyOn(service, 'hasAudioStream').mockResolvedValue(true);
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: {},
        streams: [],
      } as any);

      await service.concatenateVideos(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {
          audioCodec: 'mp3',
          videoCodec: 'libx265',
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-c:v', 'libx265']),
      );
    });
  });

  // ==========================================================================
  // imageToVideoWithKenBurns() Tests
  // ==========================================================================
  describe('imageToVideoWithKenBurns', () => {
    it('should create video from image with Ken Burns effect', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.imageToVideoWithKenBurns('/image.jpg', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-loop',
          '1',
          '-i',
          '/image.jpg',
          '-t',
          '3',
          '-r',
          '30',
        ]),
      );
    });

    it('should use custom options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.imageToVideoWithKenBurns('/image.jpg', '/output.mp4', {
        duration: 5,
        fps: 24,
        height: 720,
        width: 1280,
        zoom: 1.2,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-t', '5', '-r', '24']),
      );
    });
  });

  // ==========================================================================
  // videoToGif() Tests
  // ==========================================================================
  describe('videoToGif', () => {
    it('should convert video to GIF', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.videoToGif('/input.mp4', '/output.gif');

      // Should be called twice: once for palette, once for GIF
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('should use custom options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.videoToGif('/input.mp4', '/output.gif', {
        duration: '5',
        fps: 10,
        startTime: '00:00:05',
        width: 320,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-ss', '00:00:05', '-t', '5']),
      );
    });
  });

  // ==========================================================================
  // applyPortraitBlur() Tests
  // ==========================================================================
  describe('applyPortraitBlur', () => {
    it('should apply portrait blur effect', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.applyPortraitBlur('/input.mp4', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'boxblur=50:50']),
      );
    });

    it('should use custom blur amount', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.applyPortraitBlur('/input.mp4', '/output.mp4', 30);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'boxblur=30:30']),
      );
    });
  });

  // ==========================================================================
  // createSplitScreen() Tests
  // ==========================================================================
  describe('createSplitScreen', () => {
    it('should create split screen video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createSplitScreen('/left.mp4', '/right.mp4', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex']),
      );
    });

    it('should use audio from left', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createSplitScreen(
        '/left.mp4',
        '/right.mp4',
        '/output.mp4',
        {
          audioFrom: 'left',
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-map', '0:a?']),
      );
    });

    it('should use audio from right', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createSplitScreen(
        '/left.mp4',
        '/right.mp4',
        '/output.mp4',
        {
          audioFrom: 'right',
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-map', '1:a?']),
      );
    });

    it('should mix audio from both', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createSplitScreen(
        '/left.mp4',
        '/right.mp4',
        '/output.mp4',
        {
          audioFrom: 'mix',
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // createPortraitWithBlur() Tests
  // ==========================================================================
  describe('createPortraitWithBlur', () => {
    it('should create portrait video with blurred background', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createPortraitWithBlur('/input.mp4', '/output.mp4', {
        height: 1920,
        width: 1080,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex']),
      );
    });
  });

  // ==========================================================================
  // createVerticalSplitScreen() Tests
  // ==========================================================================
  describe('createVerticalSplitScreen', () => {
    it('should create vertical split screen', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createVerticalSplitScreen(
        '/top.mp4',
        '/bottom.mp4',
        '/output.mp4',
        {
          height: 1920,
          width: 1080,
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex', '-an']),
      );
    });
  });

  // ==========================================================================
  // scaleVideo() Tests
  // ==========================================================================
  describe('scaleVideo', () => {
    it('should scale video to specified dimensions', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.scaleVideo('/input.mp4', '/output.mp4', {
        height: 720,
        width: 1280,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'scale=1280:720,setsar=1']),
      );
    });

    it('should use custom encoding options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.scaleVideo(
        '/input.mp4',
        '/output.mp4',
        { height: 720, width: 1280 },
        {
          crf: '20',
          pixelFormat: 'yuv444p',
          preset: 'slow',
          videoCodec: 'libx265',
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-c:v',
          'libx265',
          '-preset',
          'slow',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv444p',
        ]),
      );
    });
  });

  // ==========================================================================
  // addAudioAndTextToVideo() Tests
  // ==========================================================================
  describe('addAudioAndTextToVideo', () => {
    it('should add audio to video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addAudioAndTextToVideo('/input.mp4', '/output.mp4', {
        audioPath: '/audio.mp3',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-i', '/input.mp4', '-i', '/audio.mp3']),
      );
    });

    it('should add filters', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addAudioAndTextToVideo('/input.mp4', '/output.mp4', {
        filters: ['[0:v]scale=1080:1920[vFinal]'],
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-filter_complex',
          '[0:v]scale=1080:1920[vFinal]',
        ]),
      );
    });

    it('should handle video without audio', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addAudioAndTextToVideo('/input.mp4', '/output.mp4', {
        includeAudio: false,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-an']),
      );
    });
  });

  // ==========================================================================
  // mergeVideosWithMusic() Tests
  // ==========================================================================
  describe('mergeVideosWithMusic', () => {
    it('should merge videos with background music', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mergeVideosWithMusic(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {
          musicPath: '/music.mp3',
          musicVolume: 0.1,
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex']),
      );
    });

    it('should mute video audio when specified', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mergeVideosWithMusic(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {
          musicPath: '/music.mp3',
          muteVideoAudio: true,
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should call progress callback', async () => {
      const progressOutput =
        'frame=  100 fps= 30.0 q=28.0 size=  1024kB time=00:00:03.33 bitrate=2500.0kbits/s speed=1.0x';
      const mockProcess = createMockProcess(0, '', progressOutput);
      mockSpawn.mockReturnValue(mockProcess);

      const onProgress = vi.fn();

      await service.mergeVideosWithMusic(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {},
        onProgress,
      );

      // Progress callback should be called
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // generateKenBurnsSlide() Tests
  // ==========================================================================
  describe('generateKenBurnsSlide', () => {
    it('should generate Ken Burns slide', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.generateKenBurnsSlide('/image.jpg', '/output.mp4', {
        dimensions: { height: 1080, width: 1920 },
        duration: 5,
        zoomDirection: 'in',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-loop', '1', '-i', '/image.jpg', '-t', '5']),
      );
    });

    it('should use custom fps and zoom factor', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.generateKenBurnsSlide('/image.jpg', '/output.mp4', {
        dimensions: { height: 720, width: 1280 },
        duration: 3,
        fps: 24,
        zoomDirection: 'out',
        zoomFactor: '1.2',
      });

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // createKenBurnsVideoWithTransitions() Tests
  // ==========================================================================
  describe('createKenBurnsVideoWithTransitions', () => {
    it('should create Ken Burns video with transitions', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createKenBurnsVideoWithTransitions(
        ['/slide1.jpg', '/slide2.jpg'],
        '/output.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 3 }, { duration: 3 }],
          totalDuration: 6,
          transitionDuration: 0.5,
        },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-filter_complex']),
      );
    });

    it('should handle single slide (no transitions)', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createKenBurnsVideoWithTransitions(
        ['/slide1.jpg'],
        '/output.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 5 }],
          totalDuration: 5,
          transitionDuration: 0.5,
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should use zoom configs when provided', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.createKenBurnsVideoWithTransitions(
        ['/slide1.jpg', '/slide2.jpg'],
        '/output.mp4',
        {
          dimensions: { height: 1080, width: 1920 },
          fps: 30,
          slideTexts: [{ duration: 3 }, { duration: 3 }],
          totalDuration: 6,
          transitionDuration: 0.5,
          zoomConfigs: [
            { endZoom: 1.2, startZoom: 1.0 },
            { endZoom: 1.0, startZoom: 1.2 },
          ],
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // addComplexAudioMix() Tests
  // ==========================================================================
  describe('addComplexAudioMix', () => {
    it('should add complex audio mix', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addComplexAudioMix('/video.mp4', '/output.mp4', {
        filters: [],
        musicPath: '/music.mp3',
        musicVolume: 0.05,
        slideTexts: [{ duration: 3 }, { duration: 3 }],
        voicePaths: ['/voice1.mp3', '/voice2.mp3'],
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-i', '/video.mp4', '-i', '/music.mp3']),
      );
    });
  });

  // ==========================================================================
  // getTempPath() Tests
  // ==========================================================================
  describe('getTempPath', () => {
    it('should return temp path without ingredient ID', () => {
      const result = service.getTempPath('videos');
      expect(result).toContain('tmp');
      expect(result).toContain('videos');
    });

    it('should return temp path with ingredient ID', () => {
      const result = service.getTempPath('videos', 'abc123');
      expect(result).toContain('abc123');
    });
  });

  // ==========================================================================
  // cleanupTempFiles() Tests
  // ==========================================================================
  describe('cleanupTempFiles', () => {
    it('should cleanup temp files', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(true);

      await service.cleanupTempFiles('/tmp/file1.mp4', '/tmp/file2.mp4');

      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(true);
      fs.promises.unlink.mockRejectedValueOnce(new Error('Delete failed'));

      await service.cleanupTempFiles('/tmp/file1.mp4');

      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should skip non-existent files', async () => {
      const fs = require('node:fs');
      fs.existsSync.mockReturnValue(false);

      await service.cleanupTempFiles('/tmp/nonexistent.mp4');

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // resizeVideo() Tests
  // ==========================================================================
  describe('resizeVideo', () => {
    it('should resize video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.resizeVideo('/input.mp4', '/output.mp4', 1280, 720);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf']),
      );
    });

    it('should call progress callback', async () => {
      const progressOutput =
        'frame=  100 fps= 30.0 q=28.0 size=  1024kB time=00:00:03.33 bitrate=2500.0kbits/s speed=1.0x';
      const mockProcess = createMockProcess(0, '', progressOutput);
      mockSpawn.mockReturnValue(mockProcess);

      const onProgress = vi.fn();

      await service.resizeVideo(
        '/input.mp4',
        '/output.mp4',
        1280,
        720,
        onProgress,
      );

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // mergeVideos() Tests
  // ==========================================================================
  describe('mergeVideos', () => {
    it('should merge videos using concat demuxer', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mergeVideos(['/video1.mp4', '/video2.mp4'], '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-f', 'concat', '-safe', '0']),
      );
    });
  });

  // ==========================================================================
  // mergeVideosWithTransitions() Tests
  // ==========================================================================
  describe('mergeVideosWithTransitions', () => {
    it('should merge videos with transitions', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);
      vi.spyOn(service, 'probe').mockResolvedValue({
        format: { duration: '5' },
        streams: [
          { codec_type: 'video', duration: '5', height: 1080, width: 1920 },
        ],
      } as any);

      await service.mergeVideosWithTransitions(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        {
          transition: 'dissolve',
          transitionDuration: 0.5,
        },
      );

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should fall back to simple merge for single video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mergeVideosWithTransitions(['/video1.mp4'], '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-f', 'concat']),
      );
    });

    it('should fall back to simple merge when transition is none', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mergeVideosWithTransitions(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
        { transition: 'none' },
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-f', 'concat']),
      );
    });

    it('should handle videos with mixed audio streams', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);
      vi.spyOn(service, 'probe')
        .mockResolvedValueOnce({
          format: { duration: '5' },
          streams: [
            { codec_type: 'video', height: 1080, width: 1920 },
            { codec_type: 'audio' },
          ],
        } as any)
        .mockResolvedValueOnce({
          format: { duration: '5' },
          streams: [{ codec_type: 'video', height: 1080, width: 1920 }],
        } as any);

      await service.mergeVideosWithTransitions(
        ['/video1.mp4', '/video2.mp4'],
        '/output.mp4',
      );

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // convertToPortrait() Tests
  // ==========================================================================
  describe('convertToPortrait', () => {
    it('should convert video to portrait mode', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertToPortrait('/input.mp4', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf']),
      );
    });

    it('should use custom dimensions', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertToPortrait('/input.mp4', '/output.mp4', {
        height: 1280,
        width: 720,
      });

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // addCaptions() Tests
  // ==========================================================================
  describe('addCaptions', () => {
    it('should add captions to video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addCaptions('/input.mp4', '/output.mp4', '/captions.srt');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-i', '/captions.srt', '-c:s', 'mov_text']),
      );
    });
  });

  // ==========================================================================
  // convertToGif() Tests
  // ==========================================================================
  describe('convertToGif', () => {
    it('should convert video to GIF', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertToGif('/input.mp4', '/output.gif');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-c:v', 'gif']),
      );
    });

    it('should use custom options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.convertToGif('/input.mp4', '/output.gif', {
        fps: 15,
        width: 480,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'fps=15,scale=480:-1:flags=lanczos']),
      );
    });
  });

  // ==========================================================================
  // reverseVideo() Tests
  // ==========================================================================
  describe('reverseVideo', () => {
    it('should reverse video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.reverseVideo('/input.mp4', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'reverse', '-af', 'areverse']),
      );
    });
  });

  // ==========================================================================
  // mirrorVideo() Tests
  // ==========================================================================
  describe('mirrorVideo', () => {
    it('should mirror video horizontally', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.mirrorVideo('/input.mp4', '/output.mp4');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf', 'hflip']),
      );
    });
  });

  // ==========================================================================
  // trimVideo() Tests
  // ==========================================================================
  describe('trimVideo', () => {
    it('should trim video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.trimVideo('/input.mp4', '/output.mp4', 5, 10);

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-ss', '5', '-t', '10', '-c', 'copy']),
      );
    });

    it('should reject negative start time', async () => {
      await expect(
        service.trimVideo('/input.mp4', '/output.mp4', -1, 10),
      ).rejects.toThrow('Start time must be non-negative');
    });

    it('should reject zero or negative duration', async () => {
      await expect(
        service.trimVideo('/input.mp4', '/output.mp4', 0, 0),
      ).rejects.toThrow('Duration must be positive');
    });

    it('should reject duration outside valid range', async () => {
      await expect(
        service.trimVideo('/input.mp4', '/output.mp4', 0, 1),
      ).rejects.toThrow('Duration must be between 2 and 15 seconds');

      await expect(
        service.trimVideo('/input.mp4', '/output.mp4', 0, 20),
      ).rejects.toThrow('Duration must be between 2 and 15 seconds');
    });
  });

  // ==========================================================================
  // compressVideo() Tests
  // ==========================================================================
  describe('compressVideo', () => {
    it('should compress video with default settings', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      const result = await service.compressVideo('/input.mp4', '/output.mp4');

      expect(result).toBe('/output.mp4');
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '23',
        ]),
      );
    });

    it('should use custom compression settings', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.compressVideo('/input.mp4', '/output.mp4', {
        audioBitrate: '192k',
        crf: 18,
        preset: 'slow',
        videoBitrate: '5M',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining([
          '-crf',
          '18',
          '-preset',
          'slow',
          '-b:v',
          '5M',
          '-b:a',
          '192k',
        ]),
      );
    });
  });

  // ==========================================================================
  // getVideoMetadata() Tests
  // ==========================================================================
  describe('getVideoMetadata', () => {
    it('should get video metadata', async () => {
      const mockMetadata = {
        format: { bit_rate: 1000000, duration: 120, size: 1024000 },
        streams: [
          {
            codec_type: 'video',
            height: 1080,
            r_frame_rate: '30/1',
            width: 1920,
          },
        ],
      } as any;

      vi.spyOn(service, 'probe').mockResolvedValue(mockMetadata);

      const result = await service.getVideoMetadata('/test.mp4');

      expect(result).toEqual(mockMetadata);
      expect(service.probe).toHaveBeenCalledWith('/test.mp4');
    });
  });

  // ==========================================================================
  // extractFrame() Tests
  // ==========================================================================
  describe('extractFrame', () => {
    it('should extract frame at specific time', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      const result = await service.extractFrame('/video.mp4', '/frame.jpg', 5);

      expect(result).toBe('/frame.jpg');
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-ss', '5', '-vframes', '1']),
      );
    });
  });

  // ==========================================================================
  // addTextOverlay() Tests
  // ==========================================================================
  describe('addTextOverlay', () => {
    it('should add text overlay to video', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addTextOverlay('/input.mp4', '/output.mp4', 'Hello World');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/ffmpeg',
        expect.arrayContaining(['-vf']),
      );
    });

    it('should use custom text options', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addTextOverlay('/input.mp4', '/output.mp4', 'Hello', {
        fontColor: 'yellow',
        fontSize: 64,
        position: 'top',
      });

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle different positions', async () => {
      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      await service.addTextOverlay('/input.mp4', '/output.mp4', 'Test', {
        position: 'bottom',
      });

      expect(mockSpawn).toHaveBeenCalled();

      await service.addTextOverlay('/input.mp4', '/output.mp4', 'Test', {
        position: 'center',
      });

      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================
  describe('Edge Cases and Error Handling', () => {
    it('should handle process spawn errors', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      await expect(
        service.convertVideoToAudio('/input.mp4', '/output.mp3'),
      ).rejects.toThrow('Spawn failed');
    });

    it('should handle binary validation failure', async () => {
      mockBinaryValidationService.getBinaryPaths.mockImplementationOnce(() => {
        throw new Error('Binaries not validated');
      });

      await expect(
        service.convertVideoToAudio('/input.mp4', '/output.mp3'),
      ).rejects.toThrow('Binaries not validated');
    });

    it('should handle process errors', async () => {
      const mockProcess: any = {
        kill: vi.fn(),
        on: vi.fn((event: string, callback: (arg?: any) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Process crashed')), 10);
          }
          return mockProcess;
        }),
        stderr: {
          on: vi.fn().mockReturnThis(),
        },
        stdout: {
          on: vi.fn().mockReturnThis(),
        },
      };

      mockSpawn.mockReturnValue(mockProcess);

      await expect(
        service.convertVideoToAudio('/input.mp4', '/output.mp3'),
      ).rejects.toThrow('Process crashed');
    });

    it('should parse progress output correctly', async () => {
      const progressOutput =
        'frame=  100 fps= 30.0 q=28.0 size=  1024kB time=00:00:03.33 bitrate=2500.0kbits/s speed=1.0x';

      const mockProcess: any = {
        kill: vi.fn(),
        on: vi.fn((event: string, callback: (arg?: any) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 20);
          }
          return mockProcess;
        }),
        stderr: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(progressOutput)), 5);
            }
            return mockProcess.stderr;
          }),
        },
        stdout: {
          on: vi.fn().mockReturnThis(),
        },
      };

      mockSpawn.mockReturnValue(mockProcess);

      const onProgress = vi.fn();

      await service.compressVideo('/input.mp4', '/output.mp4', {}, onProgress);

      // Progress should have been parsed and callback called
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          fps: 30.0,
          frames: 100,
          speed: '1.0x',
          time: '00:00:03.33',
        }),
      );
    });
  });
});
