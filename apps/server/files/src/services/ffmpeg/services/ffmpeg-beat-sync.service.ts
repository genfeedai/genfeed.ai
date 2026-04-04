import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import { BeatSyncCutStrategy, BeatSyncTransitionType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BeatSyncEditResult {
  outputVideoUrl: string;
  totalClips: number;
  totalDuration: number;
}

export interface BeatSyncEditOptions {
  cutStrategy: BeatSyncCutStrategy;
  transitionType: BeatSyncTransitionType;
  transitionDuration: number;
  loopVideos: boolean;
  shuffleOrder: boolean;
  beatsPerClip: number;
  customPattern?: number[];
}

interface ClipSegment {
  videoPath: string;
  startTime: number;
  duration: number;
}

/**
 * FFmpeg Beat Sync Service
 *
 * Cuts and assembles videos to match beat timestamps.
 * Creates beat-synced video edits with configurable transitions.
 */
@Injectable()
export class FFmpegBeatSyncService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly core: FFmpegCoreService,
    private readonly merge: FFmpegMergeService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Create beat-synced video from multiple inputs
   */
  async createBeatSyncedVideo(
    videoPaths: string[],
    musicUrl: string,
    beatTimestamps: number[],
    outputPath: string,
    options: BeatSyncEditOptions,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<BeatSyncEditResult> {
    const validatedVideoPaths = await Promise.all(
      videoPaths.map(async (videoPath) => {
        const validated = SecurityUtil.validateFilePath(videoPath);
        SecurityUtil.validateFileExtension(validated);
        await SecurityUtil.validateFileExists(validated);
        return validated;
      }),
    );

    const validatedMusicUrl = SecurityUtil.validateFilePath(musicUrl);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    await this.core.ensureOutputDir(validatedOutputPath);

    this.loggerService.debug(
      `${this.constructorName} creating beat-synced video`,
      {
        beatCount: beatTimestamps.length,
        cutStrategy: options.cutStrategy,
        outputPath: validatedOutputPath,
        transitionType: options.transitionType,
        videoCount: validatedVideoPaths.length,
      },
    );

    // Get video durations
    const videoDurations = await this.getVideoDurations(validatedVideoPaths);

    // Calculate clip segments based on beat timestamps and cut strategy
    const clipSegments = this.calculateClipSegments(
      validatedVideoPaths,
      videoDurations,
      beatTimestamps,
      options,
    );

    if (clipSegments.length === 0) {
      throw new Error('No clip segments generated from beat analysis');
    }

    // Create temporary segment files
    const tempDir = this.core.getTempPath('beat-sync');
    const segmentPaths: string[] = [];

    try {
      // Extract each segment
      for (let i = 0; i < clipSegments.length; i++) {
        const segment = clipSegments[i];
        const segmentPath = path.join(
          tempDir,
          `segment_${i.toString().padStart(4, '0')}.mp4`,
        );

        await this.extractSegment(
          segment.videoPath,
          segmentPath,
          segment.startTime,
          segment.duration,
        );

        segmentPaths.push(segmentPath);
      }

      // Merge segments with transitions
      const mergedVideoPath = path.join(tempDir, 'merged_video.mp4');
      await this.mergeSegmentsWithTransitions(
        segmentPaths,
        mergedVideoPath,
        options.transitionType,
        options.transitionDuration,
        onProgress,
      );

      // Add music overlay
      await this.addMusicOverlay(
        mergedVideoPath,
        validatedMusicUrl,
        validatedOutputPath,
        onProgress,
      );

      // Calculate total duration
      const probeData = await this.core.probe(validatedOutputPath);
      const totalDuration = parseFloat(probeData.format?.duration || '0');

      return {
        outputVideoUrl: validatedOutputPath,
        totalClips: clipSegments.length,
        totalDuration,
      };
    } finally {
      // Cleanup temp files
      await this.core.cleanupTempFiles(...segmentPaths);
      const mergedPath = path.join(tempDir, 'merged_video.mp4');
      await this.core.cleanupTempFiles(mergedPath);
    }
  }

  /**
   * Get durations of all input videos
   */
  private async getVideoDurations(videoPaths: string[]): Promise<number[]> {
    const durations: number[] = [];

    for (const videoPath of videoPaths) {
      try {
        const probeData = await this.core.probe(videoPath);
        const duration = parseFloat(probeData.format?.duration || '0');
        durations.push(duration);
      } catch (error) {
        this.loggerService.warn(
          `${this.constructorName} failed to get duration`,
          {
            error: error instanceof Error ? error.message : String(error),
            videoPath,
          },
        );
        durations.push(5); // Default 5 seconds
      }
    }

    return durations;
  }

  /**
   * Calculate clip segments based on cut strategy
   */
  private calculateClipSegments(
    videoPaths: string[],
    videoDurations: number[],
    beatTimestamps: number[],
    options: BeatSyncEditOptions,
  ): ClipSegment[] {
    const {
      cutStrategy,
      beatsPerClip,
      customPattern,
      loopVideos,
      shuffleOrder,
    } = options;

    // Filter beat timestamps based on cut strategy
    let targetBeats: number[];

    switch (cutStrategy) {
      case BeatSyncCutStrategy.EVERY_BEAT:
        targetBeats = beatTimestamps;
        break;
      case BeatSyncCutStrategy.EVERY_OTHER_BEAT:
        targetBeats = beatTimestamps.filter((_, i) => i % 2 === 0);
        break;
      case BeatSyncCutStrategy.DOWNBEATS_ONLY:
        targetBeats = beatTimestamps.filter((_, i) => i % 4 === 0);
        break;
      case BeatSyncCutStrategy.CUSTOM:
        if (customPattern && customPattern.length > 0) {
          targetBeats = customPattern
            .filter((i) => i >= 0 && i < beatTimestamps.length)
            .map((i) => beatTimestamps[i]);
        } else {
          targetBeats = beatTimestamps;
        }
        break;
      default:
        targetBeats = beatTimestamps;
    }

    // Group beats by clips
    const clipTimings: Array<{ start: number; duration: number }> = [];

    for (let i = 0; i < targetBeats.length; i += beatsPerClip) {
      const startBeat = targetBeats[i];
      const endBeatIndex = Math.min(i + beatsPerClip, targetBeats.length);
      const endBeat =
        targetBeats[endBeatIndex] || targetBeats[targetBeats.length - 1] + 0.5;

      clipTimings.push({
        duration: endBeat - startBeat,
        start: startBeat,
      });
    }

    // Prepare video order
    let videoOrder = videoPaths.map((path, index) => ({
      duration: videoDurations[index],
      path,
    }));

    if (shuffleOrder) {
      videoOrder = this.shuffleArray([...videoOrder]);
    }

    // Generate clip segments
    const segments: ClipSegment[] = [];
    let videoIndex = 0;
    const videoOffsets = new Map<string, number>();

    for (const timing of clipTimings) {
      if (videoOrder.length === 0) {
        break;
      }

      // Get current video
      const currentVideo = videoOrder[videoIndex % videoOrder.length];
      const currentOffset = videoOffsets.get(currentVideo.path) || 0;

      // Calculate segment
      let startTime = currentOffset;
      let duration = timing.duration;

      // Check if we have enough content in current video
      const remainingDuration = currentVideo.duration - startTime;

      if (remainingDuration < duration) {
        if (loopVideos) {
          // Reset to start of video
          startTime = 0;
          videoOffsets.set(currentVideo.path, duration);
        } else {
          // Use remaining duration
          duration = remainingDuration;
          // Move to next video
          videoIndex++;
        }
      } else {
        videoOffsets.set(currentVideo.path, startTime + duration);
      }

      if (duration > 0) {
        segments.push({
          duration,
          startTime,
          videoPath: currentVideo.path,
        });
      }

      // Move to next video for variety (even with looping)
      if (
        !loopVideos ||
        segments.length % Math.min(3, videoOrder.length) === 0
      ) {
        videoIndex++;
      }
    }

    return segments;
  }

  /**
   * Extract a video segment
   */
  private async extractSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    const args = [
      '-ss',
      startTime.toFixed(3),
      '-i',
      inputPath,
      '-t',
      duration.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-an', // Remove audio, will add music later
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Merge segments with transitions
   */
  private async mergeSegmentsWithTransitions(
    segmentPaths: string[],
    outputPath: string,
    transitionType: BeatSyncTransitionType,
    transitionDuration: number,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    if (segmentPaths.length === 0) {
      throw new Error('No segments to merge');
    }

    if (segmentPaths.length === 1) {
      // Just copy the single segment
      await fs.copyFile(segmentPaths[0], outputPath);
      return;
    }

    // Convert transition duration from ms to seconds
    const transitionSec = transitionDuration / 1000;

    if (transitionType === BeatSyncTransitionType.CUT || transitionSec <= 0) {
      // Simple concatenation without transitions
      await this.merge.concatenateVideos(segmentPaths, outputPath, {
        includeAudio: false,
      });
      return;
    }

    // Map transition types to FFmpeg xfade transitions
    const xfadeTransition = this.mapTransitionType(transitionType);

    // Use merge service with transitions
    await this.merge.mergeVideosWithTransitions(
      segmentPaths,
      outputPath,
      {
        transition: xfadeTransition,
        transitionDuration: transitionSec,
      },
      onProgress,
    );
  }

  /**
   * Map BeatSyncTransitionType to FFmpeg xfade transition
   */
  private mapTransitionType(transitionType: BeatSyncTransitionType): string {
    switch (transitionType) {
      case BeatSyncTransitionType.CROSSFADE:
        return 'fade';
      case BeatSyncTransitionType.FLASH:
        return 'fadewhite';
      case BeatSyncTransitionType.ZOOM:
        return 'zoomin';
      default:
        return 'fade';
    }
  }

  /**
   * Add music overlay to video
   */
  private async addMusicOverlay(
    videoPath: string,
    musicPath: string,
    outputPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    // Get video duration to trim music
    const probeData = await this.core.probe(videoPath);
    const videoDuration = parseFloat(probeData.format?.duration || '0');

    const args = [
      '-i',
      videoPath,
      '-i',
      musicPath,
      '-filter_complex',
      `[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS[a]`,
      '-map',
      '0:v',
      '-map',
      '[a]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
