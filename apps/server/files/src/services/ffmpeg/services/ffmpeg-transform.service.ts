import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Video transformation operations.
 * Handles resize, scale, trim, compress, and format conversions.
 */
@Injectable()
export class FFmpegTransformService {
  constructor(
    private readonly core: FFmpegCoreService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Resize video to specified dimensions
   */
  async resizeVideo(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v',
      'libx264',
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Scale video to specific dimensions
   */
  async scaleVideo(
    inputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
    options: {
      videoCodec?: string;
      preset?: string;
      crf?: string;
      pixelFormat?: string;
    } = {},
  ): Promise<void> {
    const {
      videoCodec = 'libx264',
      preset = 'ultrafast',
      crf = '23',
      pixelFormat = 'yuv420p',
    } = options;

    await this.core.ensureOutputDir(outputPath);

    const args = [
      '-i',
      inputPath,
      '-vf',
      `scale=${dimensions.width}:${dimensions.height},setsar=1`,
      '-c:v',
      videoCodec,
      '-preset',
      preset,
      '-crf',
      crf,
      '-pix_fmt',
      pixelFormat,
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Trim video to specified time range
   */
  async trimVideo(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    if (startTime < 0) {
      throw new Error('Start time must be non-negative');
    }
    if (duration <= 0) {
      throw new Error('Duration must be positive');
    }
    if (duration < 2 || duration > 15) {
      throw new Error('Duration must be between 2 and 15 seconds');
    }

    const args = SecurityUtil.sanitizeCommandArgs([
      '-ss',
      startTime.toString(),
      '-i',
      validatedInputPath,
      '-t',
      duration.toString(),
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-y',
      validatedOutputPath,
    ]);

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Compress video with specified options
   */
  async compressVideo(
    inputPath: string,
    outputPath: string,
    options?: {
      crf?: number;
      preset?: string;
      videoBitrate?: string;
      audioBitrate?: string;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<string> {
    const {
      crf = 23,
      preset = 'medium',
      videoBitrate,
      audioBitrate = '128k',
    } = options || {};

    const args = [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-crf',
      crf.toString(),
    ];

    if (videoBitrate) {
      args.push('-b:v', videoBitrate);
    }

    args.push('-c:a', 'aac', '-b:a', audioBitrate, '-y', outputPath);

    await this.core.executeFFmpeg(args, onProgress);
    return outputPath;
  }

  /**
   * Convert video to portrait mode (1080×1920 / 9:16).
   *
   * Algorithm:
   * 1. Find the largest 9:16 rectangle that fits within the source frame.
   * 2. Center-crop to that rectangle.
   * 3. Scale to the target dimensions.
   * 4. If the source is narrower than 9:16 (e.g. ultra-tall portrait), the
   *    crop is limited to the source width; the result is padded with black
   *    bars on the sides after scaling (letterbox).
   *
   * Expression logic (ffmpeg `if`):
   *   - `lte(iw*16, ih*9)` → source aspect ≤ 9/16 (narrow / ultra-portrait)
   *     → crop_w = iw, crop_h = iw*16/9  (full-width center slice)
   *     → after scale the frame may not fill full width → pad with black bars
   *   - otherwise (landscape / wide-portrait)
   *     → crop_w = ih*9/16, crop_h = ih  (standard center-crop)
   */
  async convertToPortrait(
    inputPath: string,
    outputPath: string,
    dimensions?: { width: number; height: number },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const { width = 1080, height = 1920 } = dimensions || {};

    // Conditional crop: handles both landscape→portrait (crop) and
    // ultra-narrow-portrait→portrait (letterbox) in a single filter chain.
    const cropFilter =
      `crop=` +
      `w='if(lte(iw*16,ih*9),iw,floor(ih*9/16/2)*2)':` +
      `h='if(lte(iw*16,ih*9),floor(iw*16/9/2)*2,ih)':` +
      `x='(iw-out_w)/2':` +
      `y='(ih-out_h)/2'`;

    // Scale to target; force_original_aspect_ratio+pad adds letterbox bars
    // only when the cropped region is narrower than 9:16 (ultra-narrow path).
    const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
    const padFilter = `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

    const args = [
      '-i',
      inputPath,
      '-vf',
      `${cropFilter},${scaleFilter},${padFilter}`,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Reverse video
   */
  async reverseVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      '-vf',
      'reverse',
      '-af',
      'areverse',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Mirror video horizontally
   */
  async mirrorVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      '-vf',
      'hflip',
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Apply portrait blur effect
   */
  async applyPortraitBlur(
    inputPath: string,
    outputPath: string,
    blurAmount: number = 50,
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    const safeBlurAmount = SecurityUtil.validateNumericParam(
      blurAmount,
      'blurAmount',
      1,
      100,
    );

    await this.core.ensureOutputDir(validatedOutputPath);

    const args = [
      '-i',
      validatedInputPath,
      '-vf',
      `boxblur=${safeBlurAmount}:${safeBlurAmount}`,
      '-c:a',
      'copy',
      '-y',
      validatedOutputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Create portrait video with blurred background
   */
  async createPortraitWithBlur(
    inputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    const safeWidth = SecurityUtil.validateNumericParam(
      dimensions.width,
      'width',
      100,
      7680,
    );
    const safeHeight = SecurityUtil.validateNumericParam(
      dimensions.height,
      'height',
      100,
      4320,
    );

    await this.core.ensureOutputDir(validatedOutputPath);

    const args = [
      '-i',
      validatedInputPath,
      '-filter_complex',
      `[0:v]scale=${safeWidth}:${safeHeight},boxblur=luma_radius=min(h\\,w)/20:luma_power=1[bg];[0:v]scale=${safeWidth}:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      validatedOutputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Convert video to audio
   */
  async convertVideoToAudio(
    inputPath: string,
    outputPath: string,
    options: {
      audioCodec?: string;
      audioBitrate?: string;
      format?: string;
    } = {},
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    const {
      audioCodec = 'libmp3lame',
      audioBitrate = '128k',
      format = 'mp3',
    } = options;

    const safeAudioCodec = SecurityUtil.validateStringParam(
      audioCodec,
      'audioCodec',
      50,
    );
    const safeAudioBitrate = SecurityUtil.validateStringParam(
      audioBitrate,
      'audioBitrate',
      20,
    );
    const safeFormat = SecurityUtil.validateStringParam(format, 'format', 10);

    await this.core.ensureOutputDir(validatedOutputPath);

    const args = SecurityUtil.sanitizeCommandArgs([
      '-i',
      validatedInputPath,
      '-vn',
      '-acodec',
      safeAudioCodec,
      '-ab',
      safeAudioBitrate,
      '-f',
      safeFormat,
      '-y',
      validatedOutputPath,
    ]);

    await this.core.executeFFmpeg(args);
  }

  /**
   * Extract a single frame from video at specific time
   */
  async extractFrame(
    inputPath: string,
    outputPath: string,
    timeInSeconds: number,
  ): Promise<string> {
    const args = [
      '-ss',
      timeInSeconds.toString(),
      '-i',
      inputPath,
      '-vframes',
      '1',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
    return outputPath;
  }

  /**
   * Convert video to GIF
   */
  async convertToGif(
    inputPath: string,
    outputPath: string,
    options?: { width?: number; fps?: number },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    const { width = 320, fps = 10 } = options || {};

    const args = [
      '-i',
      inputPath,
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos`,
      '-c:v',
      'gif',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args, onProgress);
  }

  /**
   * Create GIF from video with palette optimization
   */
  async videoToGif(
    inputPath: string,
    outputPath: string,
    options: {
      width?: number;
      fps?: number;
      startTime?: string;
      duration?: string;
    } = {},
  ): Promise<void> {
    const validatedInputPath = SecurityUtil.validateFilePath(inputPath);
    const validatedOutputPath = SecurityUtil.validateFilePath(outputPath);

    SecurityUtil.validateFileExtension(validatedInputPath);
    await SecurityUtil.validateFileExists(validatedInputPath);
    await SecurityUtil.validateFileSize(validatedInputPath);

    const { width = 480, fps = 15, startTime, duration } = options;

    await this.core.ensureOutputDir(validatedOutputPath);

    const args = ['-i', validatedInputPath];

    if (startTime) {
      args.push('-ss', startTime);
    }
    if (duration) {
      args.push('-t', duration);
    }

    args.push(
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`,
      '-y',
      `${validatedOutputPath}.palette.png`,
    );

    await this.core.executeFFmpeg(args);

    const gifArgs = [
      '-i',
      validatedInputPath,
      '-i',
      `${validatedOutputPath}.palette.png`,
    ];

    if (startTime) {
      gifArgs.push('-ss', startTime);
    }
    if (duration) {
      gifArgs.push('-t', duration);
    }

    gifArgs.push(
      '-lavfi',
      `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
      '-y',
      validatedOutputPath,
    );

    await this.core.executeFFmpeg(gifArgs);

    await this.core.cleanupTempFiles(`${validatedOutputPath}.palette.png`);
  }
}
