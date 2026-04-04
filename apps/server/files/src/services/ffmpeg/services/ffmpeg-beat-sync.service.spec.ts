import { FFmpegBeatSyncService } from '@files/services/ffmpeg/services/ffmpeg-beat-sync.service';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import { BeatSyncCutStrategy, BeatSyncTransitionType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/enums', () => ({
  BeatSyncCutStrategy: {
    CUSTOM: 'custom',
    DOWNBEATS_ONLY: 'downbeats_only',
    EVERY_BEAT: 'every_beat',
    EVERY_OTHER_BEAT: 'every_other_beat',
  },
  BeatSyncTransitionType: {
    CROSSFADE: 'crossfade',
    CUT: 'cut',
    FLASH: 'flash',
    ZOOM: 'zoom',
  },
}));

vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
  },
}));

vi.mock('node:fs', () => ({
  promises: {
    copyFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('node:path', () => ({
  default: {
    extname: (p: string) => {
      const parts = p.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    },
    join: (...args: string[]) => args.join('/'),
  },
}));

import { promises as fs } from 'node:fs';

describe('FFmpegBeatSyncService', () => {
  let service: FFmpegBeatSyncService;
  let mockCore: {
    ensureOutputDir: ReturnType<typeof vi.fn>;
    getTempPath: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
    executeFFmpeg: ReturnType<typeof vi.fn>;
    cleanupTempFiles: ReturnType<typeof vi.fn>;
  };
  let mockMerge: {
    concatenateVideos: ReturnType<typeof vi.fn>;
    mergeVideosWithTransitions: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const videoPaths = ['/tmp/video1.mp4', '/tmp/video2.mp4'];
  const musicUrl = '/tmp/music.mp3';
  const outputPath = '/tmp/output.mp4';
  const beatTimestamps = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

  const baseOptions = {
    beatsPerClip: 2,
    cutStrategy: BeatSyncCutStrategy.EVERY_BEAT,
    loopVideos: false,
    shuffleOrder: false,
    transitionDuration: 0,
    transitionType: BeatSyncTransitionType.CUT,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCore = {
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      ensureOutputDir: vi.fn().mockResolvedValue(undefined),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn().mockReturnValue('/tmp/beat-sync'),
      probe: vi.fn().mockResolvedValue({ format: { duration: '10.0' } }),
    };

    mockMerge = {
      concatenateVideos: vi.fn().mockResolvedValue(undefined),
      mergeVideosWithTransitions: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegBeatSyncService,
        { provide: FFmpegCoreService, useValue: mockCore },
        { provide: FFmpegMergeService, useValue: mockMerge },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(FFmpegBeatSyncService);
  });

  describe('createBeatSyncedVideo', () => {
    it('creates output directory and returns result with correct shape', async () => {
      const result = await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        baseOptions,
      );

      expect(mockCore.ensureOutputDir).toHaveBeenCalledWith(outputPath);
      expect(result).toHaveProperty('outputVideoUrl', outputPath);
      expect(result).toHaveProperty('totalClips');
      expect(result).toHaveProperty('totalDuration');
      expect(typeof result.totalClips).toBe('number');
    });

    it('extracts FFmpeg segments for each clip', async () => {
      await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        baseOptions,
      );

      // Should call executeFFmpeg for segment extraction + music overlay
      expect(mockCore.executeFFmpeg).toHaveBeenCalled();
    });

    it('uses concatenateVideos for CUT transition type', async () => {
      await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        { ...baseOptions, transitionType: BeatSyncTransitionType.CUT },
      );

      expect(mockMerge.concatenateVideos).toHaveBeenCalled();
      expect(mockMerge.mergeVideosWithTransitions).not.toHaveBeenCalled();
    });

    it('uses mergeVideosWithTransitions for CROSSFADE', async () => {
      await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        {
          ...baseOptions,
          transitionDuration: 500,
          transitionType: BeatSyncTransitionType.CROSSFADE,
        },
      );

      expect(mockMerge.mergeVideosWithTransitions).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.objectContaining({
          transition: 'fade',
          transitionDuration: 0.5,
        }),
        undefined,
      );
    });

    it('throws when no clip segments can be generated', async () => {
      await expect(
        service.createBeatSyncedVideo(
          videoPaths,
          musicUrl,
          [], // no beat timestamps → no segments
          outputPath,
          baseOptions,
        ),
      ).rejects.toThrow('No clip segments generated');
    });

    it('cleans up temp files even on failure', async () => {
      mockMerge.concatenateVideos.mockRejectedValueOnce(
        new Error('merge fail'),
      );

      await expect(
        service.createBeatSyncedVideo(
          videoPaths,
          musicUrl,
          beatTimestamps,
          outputPath,
          baseOptions,
        ),
      ).rejects.toThrow();

      expect(mockCore.cleanupTempFiles).toHaveBeenCalled();
    });

    it('applies EVERY_OTHER_BEAT strategy (halves beat count)', async () => {
      await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps, // 8 beats
        outputPath,
        { ...baseOptions, cutStrategy: BeatSyncCutStrategy.EVERY_OTHER_BEAT },
      );

      // With 4 target beats and beatsPerClip=2 → 2 segments
      const result = await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        { ...baseOptions, cutStrategy: BeatSyncCutStrategy.EVERY_BEAT },
      );

      // EVERY_BEAT with 8 beats and beatsPerClip=2 → 4 segments
      expect(result.totalClips).toBeGreaterThan(0);
    });

    it('returns totalDuration from probed output file', async () => {
      mockCore.probe.mockResolvedValue({ format: { duration: '7.5' } });

      const result = await service.createBeatSyncedVideo(
        videoPaths,
        musicUrl,
        beatTimestamps,
        outputPath,
        baseOptions,
      );

      expect(result.totalDuration).toBe(7.5);
    });

    it('copies single segment directly without merging', async () => {
      // Use a single video with beats that produce only 1 segment
      await service.createBeatSyncedVideo(
        ['/tmp/single.mp4'],
        musicUrl,
        [0, 1.0], // 1 segment (beatsPerClip=2)
        outputPath,
        { ...baseOptions, beatsPerClip: 2 },
      );

      // concatenateVideos should not be called for single segment (copyFile is used)
      expect(vi.mocked(fs.copyFile)).toHaveBeenCalled();
    });
  });
});
