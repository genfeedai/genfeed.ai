import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';

@Injectable()
export class FFmpegStreamService {
  private readonly constructorName: string = 'FFmpegStreamService';
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Process video with streaming to minimize memory usage
   */
  async processVideoStream(
    inputPath: string,
    outputPath: string,
    options: {
      resize?: { width: number; height: number };
      format?: string;
      additionalArgs?: string[];
    } = {},
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        // Force stream processing to reduce memory usage
        '-max_muxing_queue_size',
        '1024',
        '-threads',
        '2', // Limit threads to reduce memory
      ];

      if (options.resize) {
        args.push(
          '-vf',
          `scale=${options.resize.width}:${options.resize.height}:force_original_aspect_ratio=decrease,pad=${options.resize.width}:${options.resize.height}:(ow-iw)/2:(oh-ih)/2`,
        );
      }

      if (options.additionalArgs) {
        args.push(...options.additionalArgs);
      }

      args.push('-f', options.format || 'mp4');
      args.push('-movflags', 'frag_keyframe+empty_moov'); // Enable streaming output
      args.push('-y', outputPath);

      const ffmpeg = spawn(ffmpegPath!, args);
      const processId = `${Date.now()}-${Math.random()}`;
      this.activeProcesses.set(processId, ffmpeg);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress but don't accumulate too much in memory
        if (stderr.length > 10000) {
          stderr = stderr.slice(-5000);
        }
      });

      ffmpeg.on('close', (code) => {
        this.activeProcesses.delete(processId);

        if (code === 0) {
          this.loggerService.log(`${url} success`, { inputPath, outputPath });
          resolve();
        } else {
          this.loggerService.error(`${url} failed`, {
            code,
            stderr: stderr.slice(-1000),
          });
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        this.activeProcesses.delete(processId);
        this.loggerService.error(`${url} error`, error);
        reject(error);
      });

      // Set up timeout to kill process if it runs too long
      const timeout = setTimeout(
        () => {
          if (this.activeProcesses.has(processId)) {
            this.loggerService.warn(`${url} timeout, killing process`, {
              processId,
            });
            ffmpeg.kill('SIGTERM');
            setTimeout(() => {
              if (this.activeProcesses.has(processId)) {
                ffmpeg.kill('SIGKILL');
              }
            }, 5000);
          }
        },
        5 * 60 * 1000,
      ); // 5 minutes timeout

      ffmpeg.on('exit', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Stream video processing with pipe
   */
  createVideoProcessingStream(
    inputStream: Readable,
    options: {
      format?: string;
      resize?: { width: number; height: number };
    } = {},
  ): { outputStream: PassThrough; ffmpegProcess: ChildProcess } {
    const outputStream = new PassThrough();

    const args: string[] = [
      '-i',
      'pipe:0', // Read from stdin
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast', // Fastest encoding for streaming
      '-crf',
      '28', // Lower quality for faster processing
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-max_muxing_queue_size',
      '512',
      '-threads',
      '1', // Single thread for streaming
      '-bufsize',
      '1M', // Limit buffer size
    ];

    if (options.resize) {
      args.push(
        '-vf',
        `scale=${options.resize.width}:${options.resize.height}`,
      );
    }

    args.push(
      '-f',
      options.format || 'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+faststart',
      'pipe:1', // Output to stdout
    );

    const ffmpegProcess = spawn(ffmpegPath!, args);

    // Pipe input stream to ffmpeg
    inputStream.pipe(ffmpegProcess.stdin);

    // Pipe ffmpeg output to output stream
    ffmpegProcess.stdout.pipe(outputStream);

    // Handle errors
    ffmpegProcess.stderr.on('data', (data) => {
      // Log but don't accumulate stderr
      const message = data.toString().slice(0, 200);
      if (message.includes('error') || message.includes('Error')) {
        this.loggerService.error('FFmpeg stream error', { message });
      }
    });

    ffmpegProcess.on('error', (error) => {
      this.loggerService.error('FFmpeg process error', error);
      outputStream.destroy(error);
    });

    return { ffmpegProcess, outputStream };
  }

  /**
   * Clean up all active processes
   */
  cleanup(): void {
    for (const [id, process] of this.activeProcesses) {
      this.loggerService.warn('Cleaning up active FFmpeg process', { id });
      process.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.activeProcesses.has(id)) {
          process.kill('SIGKILL');
          this.activeProcesses.delete(id);
        }
      }, 5000);
    }
  }

  /**
   * Merge videos with streaming to avoid loading all into memory
   */
  async mergeVideosStream(
    inputPaths: string[],
    outputPath: string,
  ): Promise<void> {
    // Create concat file
    const concatFile = path.join(path.dirname(outputPath), 'concat.txt');
    const concatContent = inputPaths.map((p) => `file '${p}'`).join('\n');
    await fs.promises.writeFile(concatFile, concatContent);

    try {
      await this.processVideoStream(concatFile, outputPath, {
        additionalArgs: [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatFile,
          '-c',
          'copy', // Copy streams without re-encoding for speed
        ],
      });
    } finally {
      // Clean up concat file
      try {
        await fs.promises.unlink(concatFile);
      } catch (error: unknown) {
        this.loggerService.warn('Failed to delete concat file', {
          concatFile,
          error,
        });
      }
    }
  }
}
