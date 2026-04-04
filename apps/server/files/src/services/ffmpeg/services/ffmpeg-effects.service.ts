import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import {
  getPanExpression,
  getZoomExpression,
} from '@files/services/ffmpeg/helpers/ease-curves.helper';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoEaseCurve } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Video effects operations.
 * Handles Ken Burns, split screens, overlays, and captions.
 */
@Injectable()
export class FFmpegEffectsService {
  constructor(
    private readonly core: FFmpegCoreService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Create video from image with Ken Burns effect
   */
  async imageToVideoWithKenBurns(
    inputPath: string,
    outputPath: string,
    options: {
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
      zoom?: number;
    } = {},
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    const {
      duration = 3,
      fps = 30,
      width = 1920,
      height = 1080,
      zoom = 1.1,
    } = options;

    const safeDuration = SecurityUtil.validateNumericParam(
      duration,
      'duration',
      0.1,
      300,
    );
    const safeFps = SecurityUtil.validateNumericParam(fps, 'fps', 1, 120);
    const safeWidth = SecurityUtil.validateNumericParam(
      width,
      'width',
      100,
      7680,
    );
    const safeHeight = SecurityUtil.validateNumericParam(
      height,
      'height',
      100,
      4320,
    );
    const safeZoom = SecurityUtil.validateNumericParam(zoom, 'zoom', 1, 5);

    await this.core.ensureOutputDir(validatedOutputPath);

    const baseArgs = [
      '-loop',
      '1',
      '-i',
      validatedInputPath,
      '-t',
      safeDuration.toString(),
      '-r',
      safeFps.toString(),
      '-vf',
      `scale=${safeWidth}:${safeHeight}:force_original_aspect_ratio=increase,crop=${safeWidth}:${safeHeight},zoompan=z='min(zoom+0.0015,${safeZoom})':d=${safeFps * safeDuration}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-y',
      validatedOutputPath,
    ];

    const args = SecurityUtil.sanitizeCommandArgs(baseArgs);
    await this.core.executeFFmpeg(args);
  }

  /**
   * Generate Ken Burns effect video from image
   */
  async generateKenBurnsSlide(
    inputPath: string,
    outputPath: string,
    options: {
      duration: number;
      zoomDirection: string;
      fps?: number;
      zoomFactor?: string;
      dimensions: { width: number; height: number };
    },
  ): Promise<void> {
    const {
      duration,
      zoomDirection,
      fps = 30,
      zoomFactor = '1',
      dimensions,
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const frameDuration = 1000 / fps;

    const args = [
      '-loop',
      '1',
      '-i',
      inputPath,
      '-vf',
      `zoompan=z='${zoomFactor}':${zoomDirection}:d=${frameDuration},scale=${dimensions.width}:${dimensions.height},fps=${fps}`,
      '-t',
      duration.toString(),
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Create video with Ken Burns effects and transitions
   */
  async createKenBurnsVideoWithTransitions(
    slidePaths: string[],
    outputPath: string,
    options: {
      slideTexts: Array<{ duration: number }>;
      transitionDuration: number;
      fps: number;
      dimensions: { width: number; height: number };
      totalDuration: number;
      zoomEaseCurve?: VideoEaseCurve;
      zoomConfigs?: Array<{
        startZoom?: number;
        endZoom?: number;
        startX?: number;
        startY?: number;
        endX?: number;
        endY?: number;
      }>;
    },
  ): Promise<void> {
    const {
      slideTexts,
      transitionDuration,
      fps,
      dimensions,
      totalDuration,
      zoomEaseCurve,
      zoomConfigs,
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const args = ['-y'];

    slidePaths.forEach((slidePath) => {
      args.push('-i', slidePath);
    });

    let filter = '';
    let offset = slideTexts[0].duration;

    for (let i = 0; i < slidePaths.length; i++) {
      const input = `[${i}:v]`;
      const label = `s${i}`;
      const duration = slideTexts[i].duration * fps;
      const tVariable = 'on/duration';

      const zoomConfig = zoomConfigs?.[i];
      const startZoom = zoomConfig?.startZoom ?? 1.0;
      const endZoom = zoomConfig?.endZoom ?? 1.2;
      const startX = zoomConfig?.startX ?? 0.5;
      const startY = zoomConfig?.startY ?? 0.5;
      const endX = zoomConfig?.endX ?? 0.5;
      const endY = zoomConfig?.endY ?? 0.5;

      let zoomExpr: string;
      if (zoomEaseCurve && startZoom !== endZoom) {
        zoomExpr = getZoomExpression(
          startZoom,
          endZoom,
          zoomEaseCurve,
          tVariable,
        );
      } else {
        zoomExpr = `zoom+0.001`;
      }

      let xExpr: string;
      let yExpr: string;
      if (zoomEaseCurve && (startX !== endX || startY !== endY)) {
        xExpr = getPanExpression(startX, endX, 'iw', zoomEaseCurve, tVariable);
        yExpr = getPanExpression(startY, endY, 'ih', zoomEaseCurve, tVariable);
        filter += `${input}zoompan=z='${zoomExpr}':x='${xExpr}-iw/zoom/2':y='${yExpr}-ih/zoom/2':d=${duration}:fps=${fps},scale=${dimensions.width}:${dimensions.height}[${label}];`;
      } else {
        filter += `${input}zoompan=z='${zoomExpr}':x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${duration}:fps=${fps},scale=${dimensions.width}:${dimensions.height}[${label}];`;
      }
    }

    if (slidePaths.length > 1) {
      const outputLabel = 'final';
      for (let i = 1; i < slidePaths.length; i++) {
        const inputA = i === 1 ? `[s0]` : `[xf${i - 2}]`;
        const inputB = `[s${i}]`;
        const output = i === slidePaths.length - 1 ? outputLabel : `xf${i - 1}`;
        filter += `${inputA}${inputB}xfade=transition=circleopen:duration=${transitionDuration}:offset=${offset.toFixed(2)}[${output}];`;
        offset += slideTexts[i - 1].duration;
      }
    } else {
      filter += `[s0]copy[final];`;
    }

    args.push('-filter_complex', filter);
    args.push('-map', '[final]');
    args.push(
      '-c:v',
      'libx264',
      '-t',
      totalDuration.toString(),
      '-y',
      outputPath,
    );

    await this.core.executeFFmpeg(args);
  }

  /**
   * Create split screen video
   */
  async createSplitScreen(
    leftInputPath: string,
    rightInputPath: string,
    outputPath: string,
    options: {
      width?: number;
      height?: number;
      audioFrom?: 'left' | 'right' | 'mix';
    } = {},
  ): Promise<void> {
    const validatedLeftInputPath = SecurityUtil.validateFilePath(leftInputPath);
    const validatedRightInputPath =
      SecurityUtil.validateFilePath(rightInputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedLeftInputPath);
    await SecurityUtil.validateFileExists(validatedLeftInputPath);
    await SecurityUtil.validateFileSize(validatedLeftInputPath);

    SecurityUtil.validateFileExtension(validatedRightInputPath);
    await SecurityUtil.validateFileExists(validatedRightInputPath);
    await SecurityUtil.validateFileSize(validatedRightInputPath);

    const { width = 1920, height = 1080, audioFrom = 'left' } = options;

    const safeWidth = SecurityUtil.validateNumericParam(
      width,
      'width',
      100,
      7680,
    );
    const safeHeight = SecurityUtil.validateNumericParam(
      height,
      'height',
      100,
      4320,
    );

    await this.core.ensureOutputDir(validatedOutputPath);

    const halfWidth = safeWidth / 2;

    const args = [
      '-i',
      validatedLeftInputPath,
      '-i',
      validatedRightInputPath,
      '-filter_complex',
      `[0:v]scale=${halfWidth}:${safeHeight}[left];[1:v]scale=${halfWidth}:${safeHeight}[right];[left][right]hstack=inputs=2[v]`,
      '-map',
      '[v]',
    ];

    if (audioFrom === 'left') {
      args.push('-map', '0:a?');
    } else if (audioFrom === 'right') {
      args.push('-map', '1:a?');
    } else if (audioFrom === 'mix') {
      args.push('-filter_complex', '[0:a][1:a]amix=inputs=2[a]', '-map', '[a]');
    }

    args.push('-c:v', 'libx264', '-c:a', 'aac', '-y', validatedOutputPath);

    await this.core.executeFFmpeg(args);
  }

  /**
   * Create vertical split screen (top/bottom) video
   */
  async createVerticalSplitScreen(
    topInputPath: string,
    bottomInputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    await this.core.ensureOutputDir(outputPath);

    const args = [
      '-i',
      topInputPath,
      '-i',
      bottomInputPath,
      '-filter_complex',
      `nullsrc=size=${dimensions.width}x${dimensions.height * 2}[base];[0:v]scale=${dimensions.width}:${dimensions.height}[top];[1:v]scale=${dimensions.width}:${dimensions.height}[bottom];[base][top]overlay=shortest=1[tmp1];[tmp1][bottom]overlay=0:${dimensions.height}[v]`,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-an',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Add text overlay to video
   */
  async addTextOverlay(
    inputPath: string,
    outputPath: string,
    text: string,
    options?: {
      fontFile?: string;
      fontSize?: number;
      fontColor?: string;
      position?: string;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const {
      fontFile = path.resolve(
        'public',
        'assets',
        'fonts',
        'montserrat-bold.ttf',
      ),
      fontSize = 48,
      fontColor = 'white',
      position = 'center',
    } = options || {};

    let yPosition: string;
    switch (position) {
      case 'top':
        yPosition = '50';
        break;
      case 'center':
        yPosition = '(h-text_h)/2';
        break;
      case 'bottom':
        yPosition = 'h-text_h-50';
        break;
      default:
        yPosition = '(h-text_h)/2';
    }

    const escapedText = text.replace(/'/g, "\\'").replace(/:/g, '\\:');

    const args = [
      '-i',
      inputPath,
      '-vf',
      `drawtext=fontfile='${fontFile}':text='${escapedText}':fontcolor=${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.5:boxborderw=10`,
      '-codec:a',
      'copy',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Add captions to video
   */
  async addCaptions(
    inputPath: string,
    outputPath: string,
    captionsPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      '-i',
      captionsPath,
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-c:s',
      'mov_text',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Add audio and text overlays to video
   */
  async addAudioAndTextToVideo(
    inputPath: string,
    outputPath: string,
    options: {
      audioPath?: string;
      filters?: string[];
      videoCodec?: string;
      audioCodec?: string;
      includeAudio?: boolean;
    } = {},
  ): Promise<void> {
    const {
      audioPath,
      filters = [],
      videoCodec = 'libx264',
      audioCodec = 'aac',
      includeAudio = true,
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const args = ['-i', inputPath];

    if (audioPath) {
      args.push('-i', audioPath);
    }

    if (filters.length > 0) {
      args.push('-filter_complex', filters.join(';'));
    }

    args.push('-c:v', videoCodec);

    if (includeAudio && audioPath) {
      args.push('-c:a', audioCodec);
      if (filters.some((f) => f.includes('[mix]'))) {
        args.push('-map', '[vFinal]', '-map', '[mix]');
      } else {
        args.push('-map', '0:v', '-map', '1:a');
      }
      args.push('-shortest');
    } else {
      if (filters.some((f) => f.includes('[vFinal]'))) {
        args.push('-map', '[vFinal]');
      }
      args.push('-an');
    }

    args.push('-y', outputPath);

    await this.core.executeFFmpeg(args);
  }

  /**
   * Add complex audio mixing with multiple voice tracks and background music
   */
  async addComplexAudioMix(
    videoPath: string,
    outputPath: string,
    options: {
      musicPath: string;
      voicePaths: string[];
      slideTexts: Array<{ duration: number }>;
      filters: string[];
      musicVolume?: number;
    },
  ): Promise<void> {
    const {
      musicPath,
      voicePaths,
      slideTexts,
      filters,
      musicVolume = 0.05,
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const args = ['-y', '-i', videoPath, '-i', musicPath];

    voicePaths.forEach((voicePath) => {
      args.push('-i', voicePath);
    });

    const mixInputs: string[] = [];

    filters.push(`[1:a]volume=${musicVolume}[bg]`);
    mixInputs.push(`[bg]`);

    let totalOffset = 0;
    for (let i = 0; i < voicePaths.length; i++) {
      const delayMs = Math.round(totalOffset * 1000);
      totalOffset += slideTexts[i].duration;

      const tag = `a${i}`;
      filters.push(`[${i + 2}:a]adelay=${delayMs}[${tag}]`);
      mixInputs.push(`[${tag}]`);
    }

    filters.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[mix]`,
    );

    args.push('-filter_complex', filters.join(';'));
    args.push('-map', '[vFinal]', '-map', '[mix]');
    args.push('-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-y', outputPath);

    await this.core.executeFFmpeg(args);
  }

  /**
   * Overlay audio onto video with various mix modes
   *
   * @param videoPath - Path to the input video
   * @param audioPath - Path to the audio file to overlay
   * @param outputPath - Path for the output video
   * @param options - Mix mode and volume settings
   */
  async overlayAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    options: {
      mixMode: 'replace' | 'mix' | 'background';
      audioVolume?: number;
      videoVolume?: number;
      fadeIn?: number;
      fadeOut?: number;
    } = { mixMode: 'replace' },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const validatedVideoPath = SecurityUtil.validateFilePath(videoPath);
    const validatedAudioPath = SecurityUtil.validateFilePath(audioPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedVideoPath);
    await SecurityUtil.validateFileExists(validatedVideoPath);
    await SecurityUtil.validateFileSize(validatedVideoPath);

    SecurityUtil.validateFileExtension(validatedAudioPath);
    await SecurityUtil.validateFileExists(validatedAudioPath);
    await SecurityUtil.validateFileSize(validatedAudioPath);

    const {
      mixMode = 'replace',
      audioVolume = 100,
      videoVolume = 100,
      fadeIn = 0,
      fadeOut = 0,
    } = options;

    const safeAudioVolume = SecurityUtil.validateNumericParam(
      audioVolume,
      'audioVolume',
      0,
      200,
    );
    const safeVideoVolume = SecurityUtil.validateNumericParam(
      videoVolume,
      'videoVolume',
      0,
      200,
    );
    const safeFadeIn = SecurityUtil.validateNumericParam(
      fadeIn,
      'fadeIn',
      0,
      60,
    );
    const safeFadeOut = SecurityUtil.validateNumericParam(
      fadeOut,
      'fadeOut',
      0,
      60,
    );

    await this.core.ensureOutputDir(validatedOutputPath);

    const audioVolumeNormalized = safeAudioVolume / 100;
    const videoVolumeNormalized = safeVideoVolume / 100;

    const args: string[] = ['-i', validatedVideoPath, '-i', validatedAudioPath];

    if (mixMode === 'replace') {
      // Replace video audio entirely with new audio
      let audioFilter = `[1:a]volume=${audioVolumeNormalized}`;

      // Apply fade effects
      if (safeFadeIn > 0) {
        audioFilter += `,afade=t=in:st=0:d=${safeFadeIn}`;
      }
      if (safeFadeOut > 0) {
        audioFilter += `,afade=t=out:st=-${safeFadeOut}:d=${safeFadeOut}`;
      }

      audioFilter += '[aout]';

      args.push(
        '-filter_complex',
        audioFilter,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        validatedOutputPath,
      );
    } else if (mixMode === 'mix') {
      // Mix both audio tracks at specified volumes
      let filterComplex = `[0:a]volume=${videoVolumeNormalized}[va];[1:a]volume=${audioVolumeNormalized}`;

      if (safeFadeIn > 0) {
        filterComplex += `,afade=t=in:st=0:d=${safeFadeIn}`;
      }
      if (safeFadeOut > 0) {
        filterComplex += `,afade=t=out:st=-${safeFadeOut}:d=${safeFadeOut}`;
      }

      filterComplex +=
        '[aa];[va][aa]amix=inputs=2:duration=first:dropout_transition=0[aout]';

      args.push(
        '-filter_complex',
        filterComplex,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        validatedOutputPath,
      );
    } else if (mixMode === 'background') {
      // Audio as background music (lower volume, ducking)
      const bgVolume = audioVolumeNormalized * 0.3; // Background music at 30% of specified volume
      let filterComplex = `[0:a]volume=${videoVolumeNormalized}[va];[1:a]volume=${bgVolume}`;

      if (safeFadeIn > 0) {
        filterComplex += `,afade=t=in:st=0:d=${safeFadeIn}`;
      }
      if (safeFadeOut > 0) {
        filterComplex += `,afade=t=out:st=-${safeFadeOut}:d=${safeFadeOut}`;
      }

      filterComplex +=
        '[bg];[va][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]';

      args.push(
        '-filter_complex',
        filterComplex,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        validatedOutputPath,
      );
    }

    this.loggerService.log(
      `Overlaying audio: mode=${mixMode}, audioVol=${safeAudioVolume}%, videoVol=${safeVideoVolume}%`,
    );

    await this.core.executeFFmpeg(args, onProgress);
  }
}
