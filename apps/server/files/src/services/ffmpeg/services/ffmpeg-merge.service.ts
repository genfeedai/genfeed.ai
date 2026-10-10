import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { buildTransitionFilterGraph } from '@files/services/ffmpeg/helpers/transition-filter-graph.helper';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import {
  FFmpegProgress,
  FFprobeStream,
  TransitionMergeClip,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoTransition } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Video merging and concatenation operations.
 */
@Injectable()
export class FFmpegMergeService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly core: FFmpegCoreService,
    private readonly loggerService: LoggerService,
  ) {}

  async mergeNormalizedVideos(
    inputPaths: string[],
    outputPath: string,
    width: number,
    height: number,
  ): Promise<void> {
    if (
      inputPaths.length < 1 ||
      inputPaths.length > 6 ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 16 ||
      height < 16 ||
      width > 4096 ||
      height > 4096 ||
      width % 2 ||
      height % 2
    )
      throw new Error('Invalid normalized scene composition');
    const paths = await Promise.all(
      inputPaths.map(async (input) => {
        const safe = SecurityUtil.validateFilePath(input);
        SecurityUtil.validateFileExtension(safe);
        await SecurityUtil.validateFileExists(safe);
        await SecurityUtil.validateFileSize(safe);
        const probe = await this.core.probe(safe);
        if (
          !probe.streams.some((stream) => stream.codec_type === 'video') ||
          !probe.streams.some((stream) => stream.codec_type === 'audio')
        )
          throw new Error(
            'Every scene requires generated video and speech audio',
          );
        return safe;
      }),
    );
    const output = SecurityUtil.validateFilePath(outputPath);
    await this.core.ensureOutputDir(output);
    const filters = paths.flatMap((_, index) => [
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v${index}]`,
      `[${index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`,
    ]);
    filters.push(
      `${paths.map((_, index) => `[v${index}][a${index}]`).join('')}concat=n=${paths.length}:v=1:a=1[v][a]`,
    );
    await this.core.executeFFmpeg([
      '-y',
      ...paths.flatMap((input) => ['-i', input]),
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      output,
    ]);
  }

  /**
   * Concatenate multiple videos
   */
  async concatenateVideos(
    inputPaths: string[],
    outputPath: string,
    options: {
      videoCodec?: string;
      audioCodec?: string;
      includeAudio?: boolean;
    } = {},
  ): Promise<void> {
    const validatedInputPaths = await Promise.all(
      inputPaths.map(async (inputPath) => {
        const validatedPath = SecurityUtil.validateFilePath(inputPath);
        SecurityUtil.validateFileExtension(validatedPath);
        await SecurityUtil.validateFileExists(validatedPath);
        await SecurityUtil.validateFileSize(validatedPath);
        return validatedPath;
      }),
    );

    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    const {
      videoCodec = 'libx264',
      audioCodec = 'aac',
      includeAudio = true,
    } = options;

    const safeVideoCodec = SecurityUtil.validateStringParam(
      videoCodec,
      'videoCodec',
      50,
    );
    const safeAudioCodec = SecurityUtil.validateStringParam(
      audioCodec,
      'audioCodec',
      50,
    );

    await this.core.ensureOutputDir(validatedOutputPath);

    const audioStreams = includeAudio
      ? await Promise.all(
          validatedInputPaths.map((p) => this.core.hasAudioStream(p)),
        )
      : validatedInputPaths.map(() => false);

    const videoDurations = await Promise.all(
      validatedInputPaths.map(async (p) => {
        try {
          const probeData = await this.core.probe(p);
          const duration =
            probeData.format?.duration || probeData.streams[0]?.duration;
          return duration ? parseFloat(duration) : 1;
        } catch {
          return 1;
        }
      }),
    );

    const hasAnyAudio = audioStreams.some((has) => has);

    const baseArgs = ['-y'];
    validatedInputPaths.forEach((inputPath) => {
      baseArgs.push('-i', inputPath);
    });

    const args = SecurityUtil.sanitizeCommandArgs(baseArgs);

    let filterComplex = '';

    if (hasAnyAudio) {
      const videoStreamLabels: string[] = [];
      const audioStreamLabels: string[] = [];
      let silentAudioFilters = '';

      for (let i = 0; i < validatedInputPaths.length; i++) {
        videoStreamLabels.push(`[${i}:v]`);

        if (audioStreams[i]) {
          audioStreamLabels.push(`[${i}:a]`);
        } else {
          const duration = videoDurations[i];
          silentAudioFilters += `aevalsrc=0:duration=${duration}:channel_layout=stereo:sample_rate=48000[s${i}];`;
          audioStreamLabels.push(`[s${i}]`);
        }
      }

      if (silentAudioFilters) {
        filterComplex = silentAudioFilters;
      }

      const videoCount = validatedInputPaths.length;
      const allStreams = [];
      for (let i = 0; i < videoCount; i++) {
        allStreams.push(videoStreamLabels[i]);
        allStreams.push(audioStreamLabels[i]);
      }
      const streamList = allStreams.join('');

      filterComplex += `${streamList}concat=n=${videoCount}:v=1:a=1[outv][outa]`;
    } else {
      const videoInputs = validatedInputPaths
        .map((_, i) => `[${i}:v]`)
        .join('');
      filterComplex = `${videoInputs}concat=n=${validatedInputPaths.length}:v=1:a=0[outv]`;
    }

    args.push(
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      '-c:v',
      safeVideoCodec,
    );

    if (hasAnyAudio) {
      args.push('-map', '[outa]', '-c:a', safeAudioCodec);
    }

    args.push('-movflags', '+faststart', validatedOutputPath);

    await this.core.executeFFmpeg(args);
  }

  /**
   * Merge multiple videos (simple concat)
   */
  async mergeVideos(
    videoPaths: string[],
    outputPath: string,
    options?: { muteVideoAudio?: boolean },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const listFile = path.join(
      this.core.getTempPath('merge'),
      'merge_list.txt',
    );
    const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');

    await fs.writeFile(listFile, listContent);

    try {
      const args = [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c',
        'copy',
        ...(options?.muteVideoAudio ? ['-an'] : []),
        '-y',
        outputPath,
      ];

      await this.core.executeFFmpeg(args, onProgress);
    } finally {
      await this.core.cleanupTempFiles(listFile);
    }
  }

  /**
   * Merge multiple videos with xfade transitions
   */
  async mergeVideosWithTransitions(
    videoPaths: string[],
    outputPath: string,
    options: {
      muteVideoAudio?: boolean;
      transition?: string;
      transitionDuration?: number;
    } = {},
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const {
      muteVideoAudio = false,
      transition = VideoTransition.DISSOLVE,
      transitionDuration = 0.5,
    } = options;

    if (videoPaths.length < 2 || transition === VideoTransition.NONE) {
      return this.mergeVideos(
        videoPaths,
        outputPath,
        muteVideoAudio ? { muteVideoAudio } : undefined,
        onProgress,
      );
    }

    const { clips, height, width } =
      await this.probeTransitionClips(videoPaths);

    // Muting drops every clip's audio instead of crossfading it.
    const isAudioIncluded = !muteVideoAudio && clips.some((c) => c.hasAudio);
    const graph = buildTransitionFilterGraph({
      clips,
      height,
      isAudioIncluded,
      transition,
      transitionDuration,
      width,
    });

    const args: string[] = ['-y'];
    for (const videoPath of videoPaths) {
      args.push('-i', videoPath);
    }
    args.push(
      '-filter_complex',
      graph.filterComplex,
      '-map',
      graph.videoLabel,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
    );
    if (graph.audioLabel) {
      args.push('-map', graph.audioLabel, '-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }
    args.push('-movflags', '+faststart', outputPath);

    this.loggerService.debug(
      `Merging ${videoPaths.length} videos with ${transition} transition`,
      {
        durations: clips.map((clip) => clip.duration),
        filterComplex: graph.filterComplex,
        outputDuration: graph.outputDuration,
        service: this.constructorName,
      },
    );

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Video duration and audio presence of each clip, plus the even-sized
   * output resolution taken from the first clip. A clip that cannot be
   * probed fails the merge instead of being guessed at.
   */
  private async probeTransitionClips(videoPaths: string[]): Promise<{
    clips: TransitionMergeClip[];
    height: number;
    width: number;
  }> {
    const clips: TransitionMergeClip[] = [];
    let width = 0;
    let height = 0;

    for (const [index, videoPath] of videoPaths.entries()) {
      const probeData = await this.core.probe(videoPath);
      const videoStream = probeData.streams.find(
        (stream: FFprobeStream) => stream.codec_type === 'video',
      );
      if (!videoStream) {
        throw new Error(`Transition clip ${index + 1} has no video stream`);
      }

      // The video stream's own length places the transition; the container
      // duration also covers a longer audio track.
      const duration = Number(
        videoStream.duration ?? probeData.format?.duration,
      );
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(
          `Transition clip ${index + 1} has no positive video duration`,
        );
      }
      clips.push({
        duration,
        hasAudio: probeData.streams.some(
          (stream: FFprobeStream) => stream.codec_type === 'audio',
        ),
      });

      if (index === 0) {
        if (!videoStream.width || !videoStream.height) {
          throw new Error('Transition clip 1 has no video dimensions');
        }
        width = videoStream.width - (videoStream.width % 2);
        height = videoStream.height - (videoStream.height % 2);
      }
    }

    return { clips, height, width };
  }

  /**
   * Merge multiple video clips with background music
   */
  async mergeVideosWithMusic(
    videoPaths: string[],
    outputPath: string,
    options: {
      musicPath?: string;
      musicVolume?: number;
      muteVideoAudio?: boolean;
      videoCodec?: string;
      audioCodec?: string;
      preset?: string;
      crf?: string;
    } = {},
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const {
      musicPath,
      musicVolume = 0.05,
      muteVideoAudio = false,
      videoCodec = 'libx264',
      audioCodec = 'aac',
      preset = 'ultrafast',
      crf = '23',
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const args = ['-y'];

    videoPaths.forEach((videoPath) => {
      args.push('-i', videoPath);
    });

    if (musicPath) {
      args.push('-i', musicPath);
    }

    const filterComplex = [];

    if (muteVideoAudio && musicPath) {
      const videoInputs = videoPaths.map((_, i) => `[${i}:v]`).join('');
      filterComplex.push(
        `${videoInputs}concat=n=${videoPaths.length}:v=1:a=0[outv]`,
      );
      filterComplex.push(
        `[${videoPaths.length}:a]volume=${musicVolume}[finala]`,
      );
    } else {
      const videoInputs = videoPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
      filterComplex.push(
        `${videoInputs}concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`,
      );

      if (musicPath) {
        filterComplex.push(`[${videoPaths.length}:a]volume=${musicVolume}[bg]`);
        filterComplex.push(
          '[outa][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[finala]',
        );
      }
    }

    args.push('-filter_complex', filterComplex.join(';'));
    args.push('-c:v', videoCodec, '-c:a', audioCodec);
    args.push('-preset', preset, '-crf', crf);
    args.push('-movflags', '+faststart', '-pix_fmt', 'yuv420p');
    args.push('-map', '[outv]');

    if (muteVideoAudio && musicPath) {
      args.push('-map', '[finala]');
    } else if (musicPath) {
      args.push('-map', '[finala]');
    } else {
      args.push('-map', '[outa]');
    }

    args.push(outputPath);

    await this.core.executeFFmpeg(args, onProgress);
  }
}
