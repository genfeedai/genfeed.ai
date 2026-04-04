import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, promises as fs, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import {
  FFmpegProgress,
  FFprobeData,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, OnModuleInit } from '@nestjs/common';

/**
 * Core FFmpeg execution service.
 * Handles binary execution, probing, and temp file management.
 */
@Injectable()
export class FFmpegCoreService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly binaryValidationService: BinaryValidationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.binaryValidationService.validateBinaries();
  }

  /**
   * Execute ffmpeg command with arguments
   */
  executeFFmpeg(
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
    const basePath = path.join(process.cwd(), 'public', 'tmp');
    let tmpDir: string;

    if (ingredientId) {
      tmpDir = path.join(basePath, type, ingredientId);
    } else {
      tmpDir = path.join(basePath, type);
    }

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
        if (existsSync(filePath)) {
          await fs.unlink(filePath);
          this.loggerService.log(`Cleaned up temp file: ${filePath}`);
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
