import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';

const ffprobeStatic = require('ffprobe-static');

@Injectable()
export class BinaryValidationService {
  public static validated = false;
  public static validationPromise: Promise<void> | null = null;

  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Validate binaries once per application lifecycle
   * Uses singleton pattern to avoid multiple validations
   */
  async validateBinaries(): Promise<void> {
    if (BinaryValidationService.validated) {
      return;
    }

    if (BinaryValidationService.validationPromise) {
      return BinaryValidationService.validationPromise;
    }

    BinaryValidationService.validationPromise = Promise.resolve(
      this.performValidation(),
    );
    await BinaryValidationService.validationPromise;
    BinaryValidationService.validated = true;
  }

  private performValidation(): void {
    const constructorName = 'BinaryValidationService';

    // Validate FFmpeg
    if (!ffmpegPath) {
      const error = `${constructorName} FFmpeg binary not found. Please ensure ffmpeg-static is properly installed.`;
      this.loggerService.error(error);
      throw new Error(error);
    }

    // Validate FFprobe
    if (!ffprobeStatic.path) {
      const error = `${constructorName} FFprobe binary not found. Please ensure ffprobe-static is properly installed.`;
      this.loggerService.error(error);
      throw new Error(error);
    }

    this.loggerService.log(`${constructorName} Binary validation successful`, {
      ffmpegPath,
      ffprobePath: ffprobeStatic.path,
    });
  }

  /**
   * Get validated binary paths
   */
  getBinaryPaths(): { ffmpegPath: string; ffprobePath: string } {
    if (!BinaryValidationService.validated) {
      throw new Error(
        'Binaries not validated yet. Call validateBinaries() first.',
      );
    }

    return {
      ffmpegPath: ffmpegPath!,
      ffprobePath: ffprobeStatic.path,
    };
  }
}
