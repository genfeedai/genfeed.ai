import { ChildProcess, spawn } from 'node:child_process';
import { CacheResult } from '@files/helpers/decorators/cache.decorator';
import { GlobalCaches } from '@files/helpers/utils/cache/cache.util';
import { FileSystemUtil } from '@files/helpers/utils/file-system/file-system.util';
import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { FFmpegConfigService } from '@files/services/ffmpeg/config/ffmpeg.config';
import {
  FFmpegProgress,
  FFprobeData,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ProcessOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
  maxRetries?: number;
  onProgress?: (progress: FFmpegProgress) => void;
  signal?: AbortSignal;
}

export interface ProcessResult {
  success: boolean;
  duration: number;
  error?: string;
  outputPath?: string;
}

@Injectable()
export class FFmpegPerformanceService {
  private readonly constructorName = this.constructor.name;
  private activeProcesses = new Map<string, ChildProcess>();
  private processQueue: Array<() => Promise<void>> = [];
  private concurrentProcesses = 0;
  private readonly tempFiles = new Set<string>();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly ffmpegConfig: FFmpegConfigService,
    private readonly binaryValidationService: BinaryValidationService,
  ) {
    // Validate binaries once on service initialization
    this.binaryValidationService.validateBinaries();
    this.setupCleanupHandlers();
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      // Use proper error handling for cleanup operations
      Promise.all([this.cancelAllProcesses(), this.cleanupTempFiles()])
        .catch((error) => {
          this.loggerService.error('Cleanup failed during shutdown', error);
        })
        .finally(() => {
          // Ensure process can exit even if cleanup fails
          process.exit(0);
        });
    };

    // Remove previous listeners to avoid memory leaks
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');

    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);
    // Don't add exit handler as it can cause infinite loops
  }

  /**
   * Execute ffmpeg command with enhanced performance features and caching for similar operations
   */
  @CacheResult({
    keyGenerator: (args: string[], options: ProcessOptions = {}) => {
      // Create cache key from args and relevant options, excluding progress callback and signal
      const cacheableOptions = {
        maxRetries: options.maxRetries,
        priority: options.priority,
        timeout: options.timeout,
      };
      return `ffmpeg:${JSON.stringify(args)}:${JSON.stringify(cacheableOptions)}`;
    },
    ttl: 600000, // 10 minutes cache for process results
  })
  async executeFFmpeg(
    args: string[],
    options: ProcessOptions = {},
  ): Promise<ProcessResult> {
    const processId = this.generateProcessId();
    const startTime = Date.now();
    const config = this.ffmpegConfig.config;

    // Queue management - limit concurrent processes
    if (this.concurrentProcesses >= (config.maxConcurrentProcesses || 3)) {
      await this.waitForAvailableSlot();
    }

    try {
      this.concurrentProcesses++;
      const result = await this.executeWithTimeout(processId, args, options);

      return {
        duration: Date.now() - startTime,
        outputPath: result,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message ?? String(error);
      this.loggerService.error(`${this.constructorName} process failed`, {
        args: args.slice(0, 5), // Log first 5 args only for security
        duration: Date.now() - startTime,
        error: errorMessage,
        processId,
      });

      return {
        duration: Date.now() - startTime,
        error: errorMessage,
        success: false,
      };
    } finally {
      this.concurrentProcesses--;
      this.activeProcesses.delete(processId);
    }
  }

  /**
   * Execute ffmpeg with timeout and cancellation support
   */
  private executeWithTimeout(
    processId: string,
    args: string[],
    options: ProcessOptions,
  ): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.ffmpegConfig.processTimeout;
      const { ffmpegPath } = this.binaryValidationService.getBinaryPaths();
      const process = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcesses.set(processId, process);

      let stderr = '';
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.loggerService.warn(`${this.constructorName} process timeout`, {
            processId,
            timeout,
          });
          process.kill('SIGKILL');
          reject(new Error(`Process timed out after ${timeout}ms`));
        }, timeout);
      }

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          this.loggerService.log(`${this.constructorName} process cancelled`, {
            processId,
          });
          process.kill('SIGTERM');
          reject(new Error('Process cancelled'));
        });
      }

      // Monitor stderr for progress and errors
      process.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        // Parse and report progress
        if (options.onProgress) {
          this.parseProgress(output, options.onProgress);
        }
      });

      process.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (code === 0) {
          this.loggerService.debug(
            `${this.constructorName} process completed`,
            {
              code,
              processId,
            },
          );
          resolve(undefined);
        } else {
          reject(
            new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`),
          ); // Last 500 chars only
        }
      });

      process.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
    });
  }

  /**
   * Parse FFmpeg progress output
   */
  private parseProgress(
    output: string,
    onProgress: (progress: FFmpegProgress) => void,
  ): void {
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

  /**
   * Enhanced probe with caching using GlobalCaches
   */
  @CacheResult({
    keyGenerator: (inputPath: string) => `probe:${inputPath}`,
    ttl: 900000, // 15 minutes cache for probe data
  })
  async probe(inputPath: string): Promise<FFprobeData> {
    return await this.executeProbe(inputPath);
  }

  /**
   * Execute ffprobe command
   */
  private executeProbe(inputPath: string): Promise<FFprobeData> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ];

      const { ffprobePath } = this.binaryValidationService.getBinaryPaths();
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
            reject(
              new Error(`Failed to parse ffprobe output: ${String(error)}`),
            );
          }
        } else {
          reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * Cancel a specific process
   */
  async cancelProcess(processId: string): Promise<boolean> {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      return false;
    }

    return new Promise((resolve) => {
      process.once('close', () => resolve(true));
      process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Cancel all active processes
   */
  async cancelAllProcesses(): Promise<void> {
    const promises = Array.from(this.activeProcesses.keys()).map((processId) =>
      this.cancelProcess(processId),
    );

    await Promise.allSettled(promises);
  }

  /**
   * Get active process count
   */
  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Get process queue length
   */
  getQueueLength(): number {
    return this.processQueue.length;
  }

  /**
   * Register temporary file for cleanup
   */
  registerTempFile(filePath: string): void {
    this.tempFiles.add(filePath);
  }

  /**
   * Clean up all temporary files
   */
  async cleanupTempFiles(): Promise<void> {
    const cleanupPromises = Array.from(this.tempFiles).map(async (filePath) => {
      try {
        await FileSystemUtil.cleanupFile(filePath);
        this.tempFiles.delete(filePath);
      } catch (error: unknown) {
        this.loggerService.warn(
          `${this.constructorName} failed to cleanup temp file`,
          {
            error: (error as Error)?.message ?? String(error),
            filePath,
          },
        );
      }
    });

    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Create chunked processing for large operations
   */
  async processInChunks<T>(
    items: T[],
    processor: (item: T) => Promise<unknown>,
    chunkSize: number = 5,
  ): Promise<unknown[]> {
    const results: unknown[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = await Promise.allSettled(
        chunk.map((item) => processor(item)),
      );

      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Generate unique process ID
   */
  private generateProcessId(): string {
    return `ffmpeg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Wait for available processing slot
   */
  private async waitForAvailableSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (
          this.concurrentProcesses < this.ffmpegConfig.maxConcurrentProcesses
        ) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  /**
   * Get service statistics including cache stats
   */
  getStats(): {
    activeProcesses: number;
    queueLength: number;
    tempFiles: number;
    cacheStats: Record<string, unknown>;
  } {
    return {
      activeProcesses: this.activeProcesses.size,
      cacheStats: GlobalCaches.getAllStats(),
      queueLength: this.processQueue.length,
      tempFiles: this.tempFiles.size,
    };
  }

  /**
   * Clear all caches used by this service
   */
  clearCaches(): void {
    GlobalCaches.clearAll();
  }
}
