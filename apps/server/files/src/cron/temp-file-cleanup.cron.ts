import * as fs from 'node:fs';
import path from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface CleanupResult {
  filesDeleted: number;
  totalFiles: number;
  message: string;
}

@Injectable()
export class TempFileCleanupCron {
  private readonly cleanupIntervalMs = 5 * 60 * 1000;
  private lastCleanupAt = 0;
  private readonly maxAge = 30 * 60 * 1000; // 30 minutes in milliseconds
  private readonly tmpDir = path.resolve('public', 'tmp', 'metadata');

  constructor(private readonly logger: LoggerService) {}

  /** Cleanup old local files opportunistically on metadata traffic. */
  cleanupTempFiles(): void {
    const now = Date.now();
    if (now - this.lastCleanupAt < this.cleanupIntervalMs) {
      return;
    }
    this.lastCleanupAt = now;

    this.logger.log('Starting local temp file cleanup...');

    try {
      const result = this.performCleanup({ verbose: true });
      this.logger.log(
        `Cleanup completed: ${result.filesDeleted} files deleted out of ${result.totalFiles} total files`,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to cleanup temp files:', error);
    }
  }

  /**
   * Manual cleanup method that can be called from controller or tests
   */
  manualCleanup(): CleanupResult {
    return this.performCleanup({ verbose: false });
  }

  private performCleanup(options: { verbose: boolean }): CleanupResult {
    if (!fs.existsSync(this.tmpDir)) {
      if (options.verbose) {
        this.logger.log('Temp directory does not exist, nothing to clean up');
      }
      return {
        filesDeleted: 0,
        message: 'Temp directory does not exist',
        totalFiles: 0,
      };
    }

    const files = fs.readdirSync(this.tmpDir);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      try {
        const filePath = path.join(this.tmpDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > this.maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
          if (options.verbose) {
            this.logger.log(
              `Deleted old temp file: ${file} (age: ${Math.round(age / 60000)} minutes)`,
            );
          }
        }
      } catch (fileError: unknown) {
        this.logger.warn(
          `Failed to process file ${file} during cleanup:`,
          fileError instanceof Error ? fileError.message : String(fileError),
        );
      }
    }

    return {
      filesDeleted: deletedCount,
      message: 'Cleanup completed successfully',
      totalFiles: files.length,
    };
  }
}
