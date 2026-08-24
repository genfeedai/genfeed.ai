import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, promises as fs, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import {
  FFmpegProgress,
  FFprobeData,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeSegment, resolveContainedPath } from '@libs/security';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';

const createBadRequest = (message: string) => new BadRequestException(message);

const DEFAULT_FFMPEG_MAX_CONCURRENCY = 4;

/**
 * Small process-wide FIFO semaphore. Bounds how many FFmpeg processes may
 * run concurrently; callers beyond the limit queue in call order and are
 * released one at a time as running processes finish.
 */
export class FifoSemaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError(
        'FFmpeg concurrency limit must be a positive safe integer',
      );
    }

    this.available = limit;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    this.available += 1;
  }
}

/**
 * Core FFmpeg execution service.
 * Handles binary execution, probing, and temp file management.
 */
@Injectable()
export class FFmpegCoreService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);
  private readonly ffmpegSemaphore: FifoSemaphore;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly binaryValidationService: BinaryValidationService,
    private readonly configService: ConfigService,
  ) {
    const configuredMaxConcurrency = this.configService.get(
      'FFMPEG_MAX_CONCURRENCY',
    );
    const maxConcurrency =
      configuredMaxConcurrency === undefined ||
      configuredMaxConcurrency.trim() === ''
        ? DEFAULT_FFMPEG_MAX_CONCURRENCY
        : Number(configuredMaxConcurrency);
    this.ffmpegSemaphore = new FifoSemaphore(maxConcurrency);
  }

  async onModuleInit(): Promise<void> {
    await this.binaryValidationService.validateBinaries();
  }

  /**
   * Execute ffmpeg command with arguments. Spawning is bounded by a
   * process-wide semaphore (FFMPEG_MAX_CONCURRENCY, default 4) so an
   * unbounded number of simultaneous encoders can never exhaust the host.
   */
  async executeFFmpeg(
    args: string[],
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    await this.ffmpegSemaphore.acquire();
    try {
      await this.spawnFFmpeg(args, onProgress);
    } finally {
      this.ffmpegSemaphore.release();
    }
  }

  private spawnFFmpeg(
    args: string[],
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let ffmpegPath: string;
      try {
        const paths = this.binaryValidationService.getBinaryPaths();
        ffmpegPath = paths.ffmpegPath;
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const process: ChildProcess = spawn(ffmpegPath, args);
      let stderr = '';

      process.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        if (onProgress) {
          const progressMatch = output.match(
            /frame=\s*(\d+)\s+fps=\s*([\d.]+).*?q=\s*([\d.-]+).*?size=\s*(\w+).*?time=\s*([\d:.]+).*?bitrate=\s*([\d.]+\w+\/s).*?speed=\s*([\d.]+x)/,
          );

          if (progressMatch) {
            onProgress({
              bitrate: progressMatch[6],
              fps: parseFloat(progressMatch[2]),
              frames: parseInt(progressMatch[1], 10),
              q: parseFloat(progressMatch[3]),
              size: progressMatch[4],
              speed: progressMatch[7],
              time: progressMatch[5],
            });
          }
        }
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute ffmpeg and return stdout/stderr even on non-zero exit.
   * Used by detect filters (blackdetect, freezedetect, ebur128) whose
   * findings are written to stderr.
   */
  async executeFFmpegCapture(
    args: string[],
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    await this.ffmpegSemaphore.acquire();
    try {
      return await this.spawnFFmpegCapture(args);
    } finally {
      this.ffmpegSemaphore.release();
    }
  }

  private spawnFFmpegCapture(
    args: string[],
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      let ffmpegPath: string;
      try {
        const paths = this.binaryValidationService.getBinaryPaths();
        ffmpegPath = paths.ffmpegPath;
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      const process: ChildProcess = spawn(ffmpegPath, args);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({ code, stderr, stdout });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Execute ffprobe command to get media information
   */
  async probe(inputPath: string): Promise<FFprobeData> {
    const { ffprobePath } = this.binaryValidationService.getBinaryPaths();
    const validatedPath = SecurityUtil.validateFilePath(inputPath);

    SecurityUtil.validateFileExtension(validatedPath);
    await SecurityUtil.validateFileExists(validatedPath);
    await SecurityUtil.validateFileSize(validatedPath);

    return new Promise((resolve, reject) => {
      const args = SecurityUtil.sanitizeCommandArgs([
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ]);

      this.loggerService.debug(
        `${this.constructorName} executing ffprobe: ${ffprobePath} ${args.join(' ')}`,
      );

      const process = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            resolve(data);
          } catch (error: unknown) {
            const errorMsg = `Failed to parse ffprobe output: ${String(error)}`;
            this.loggerService.error(`${this.constructorName} probe failed`, {
              error: errorMsg,
              stderr,
              stdout,
            });
            reject(new Error(errorMsg));
          }
        } else {
          const errorMsg = `FFprobe exited with code ${code}: ${stderr}`;
          this.loggerService.error(`${this.constructorName} probe failed`, {
            code,
            inputPath,
            stderr,
          });
          reject(new Error(errorMsg));
        }
      });

      process.on('error', (error) => {
        this.loggerService.error(
          `${this.constructorName} probe process error`,
          { error: getErrorMessage(error), ffprobePath, inputPath },
        );
        reject(error);
      });
    });
  }

  /**
   * Check if file has audio stream
   */
  async hasAudioStream(inputPath: string): Promise<boolean> {
    try {
      const probeData = await this.probe(inputPath);
      return probeData.streams.some((stream) => stream.codec_type === 'audio');
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} hasAudioStream failed`,
        error,
      );
      return false;
    }
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(videoPath: string): Promise<FFprobeData> {
    return this.probe(videoPath);
  }

  /**
   * Get temporary file path
   */
  getTempPath(type: string, ingredientId?: string): string {
    const safeType = assertSafeSegment(type, 'type', createBadRequest);
    const candidate = ingredientId
      ? path.join(
          safeType,
          assertSafeSegment(ingredientId, 'ingredientId', createBadRequest),
        )
      : safeType;
    const tmpDir = resolveContainedPath(
      FILES_TMP_ROOT,
      candidate,
      createBadRequest,
    );

    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(...filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        const containedPath = resolveContainedPath(
          FILES_TMP_ROOT,
          filePath,
          createBadRequest,
        );
        if (existsSync(containedPath)) {
          await fs.unlink(containedPath);
          this.loggerService.log(`Cleaned up temp file: ${containedPath}`);
        }
      } catch (error: unknown) {
        this.loggerService.error(`Failed to clean up ${filePath}`, error);
      }
    }
  }

  /**
   * Ensure directory exists for output path
   */
  async ensureOutputDir(outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
  }
}
