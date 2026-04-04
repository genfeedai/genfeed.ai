import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import {
  FFmpegProgress,
  FFprobeStream,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoEaseCurve } from '@genfeedai/enums';
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
    _options?: { transition?: string },
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
      transition?: string;
      transitionDuration?: number;
      transitionEaseCurve?: VideoEaseCurve;
    } = {},
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const { transition = 'dissolve', transitionDuration = 0.5 } = options;

    if (videoPaths.length < 2 || transition === 'none') {
      return this.mergeVideos(videoPaths, outputPath, undefined, onProgress);
    }

    const durations: number[] = [];
    const audioStreams: boolean[] = [];
    const resolutions: Array<{ width: number; height: number }> = [];

    for (const videoPath of videoPaths) {
      try {
        const probeData = await this.core.probe(videoPath);
        const videoStream = probeData.streams.find(
          (stream: FFprobeStream) => stream.codec_type === 'video',
        );

        const duration =
          probeData.format?.duration ||
          videoStream?.duration ||
          probeData.streams[0]?.duration;
        durations.push(duration ? parseFloat(duration) : 5);

        const hasAudio = probeData.streams.some(
          (stream: FFprobeStream) => stream.codec_type === 'audio',
        );
        audioStreams.push(hasAudio);

        const rawWidth = videoStream?.width || 1080;
        const rawHeight = videoStream?.height || 1920;
        const width = rawWidth % 2 === 0 ? rawWidth : rawWidth - 1;
        const height = rawHeight % 2 === 0 ? rawHeight : rawHeight - 1;
        resolutions.push({ height, width });
      } catch {
        durations.push(5);
        audioStreams.push(false);
        resolutions.push({ height: 1920, width: 1080 });
      }
    }

    const hasAnyAudio = audioStreams.some((has) => has);
    const targetWidth = resolutions[0]?.width || 1080;
    const targetHeight = resolutions[0]?.height || 1920;

    let scaleFilters = '';
    for (let i = 0; i < videoPaths.length; i++) {
      if (scaleFilters) {
        scaleFilters += ';';
      }
      scaleFilters += `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[scaled${i}]`;
    }

    let videoFilter = '';
    let audioFilter = '';
    let offset = Math.max(0, durations[0] - transitionDuration);

    for (let i = 0; i < videoPaths.length - 1; i++) {
      const inputA = i === 0 ? '[scaled0]' : `[v${i}]`;
      const inputB = `[scaled${i + 1}]`;
      const output = i === videoPaths.length - 2 ? '[vout]' : `[v${i + 1}]`;

      if (videoFilter) {
        videoFilter += ';';
      }

      videoFilter += `${inputA}${inputB}xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset.toFixed(2)}${output}`;

      if (i < videoPaths.length - 2) {
        offset += durations[i + 1] - transitionDuration;
      }
    }

    if (hasAnyAudio) {
      const audioInputs: string[] = [];

      for (let i = 0; i < videoPaths.length; i++) {
        if (audioStreams[i]) {
          audioFilter += audioFilter ? ';' : '';
          audioFilter += `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[aud${i}]`;
        } else {
          const duration = durations[i] || 1;
          audioFilter += audioFilter ? ';' : '';
          audioFilter += `aevalsrc=0:duration=${duration}:channel_layout=stereo:sample_rate=48000[aud${i}]`;
        }
        audioInputs.push(`[aud${i}]`);
      }

      for (let i = 0; i < videoPaths.length - 1; i++) {
        const inputA = i === 0 ? audioInputs[0] : `[a${i}]`;
        const inputB = audioInputs[i + 1];
        const output = i === videoPaths.length - 2 ? '[aout]' : `[a${i + 1}]`;

        audioFilter += ';';
        audioFilter += `${inputA}${inputB}acrossfade=d=${transitionDuration}:c1=tri:c2=tri${output}`;
      }
    }

    let filterComplex = scaleFilters;
    if (videoFilter) {
      filterComplex += `;${videoFilter}`;
    }
    if (hasAnyAudio && audioFilter) {
      filterComplex += `;${audioFilter}`;
    }

    const args: string[] = [];

    for (const videoPath of videoPaths) {
      args.push('-i', videoPath);
    }

    args.push(
      '-filter_complex',
      filterComplex,
      '-map',
      '[vout]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
    );

    if (hasAnyAudio && audioFilter) {
      args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
    }

    args.push('-y', outputPath);

    this.loggerService.debug(
      `Merging ${videoPaths.length} videos with ${transition} transition`,
      { durations, filterComplex, service: this.constructorName },
    );

    await this.core.executeFFmpeg(args, onProgress);
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
