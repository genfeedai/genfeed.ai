import { execFileSync } from 'node:child_process';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

@Injectable()
export class BinaryValidationService {
  public static validated = false;
  public static validationPromise: Promise<void> | null = null;
  private static binaryPaths: {
    ffmpegPath: string;
    ffprobePath: string;
  } | null = null;

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

    BinaryValidationService.validationPromise = Promise.resolve().then(() =>
      this.performValidation(),
    );
    try {
      await BinaryValidationService.validationPromise;
      BinaryValidationService.validated = true;
    } catch (error: unknown) {
      BinaryValidationService.validationPromise = null;
      throw error;
    }
  }

  private performValidation(): void {
    const constructorName = 'BinaryValidationService';

    BinaryValidationService.binaryPaths = null;
    const paths = {
      ffmpegPath: this.resolveExecutable(ffmpegPath, 'ffmpeg'),
      ffprobePath: this.resolveExecutable(ffprobeStatic.path, 'ffprobe'),
    };
    BinaryValidationService.binaryPaths = paths;
    this.loggerService.log(
      `${constructorName} Binary validation successful`,
      paths,
    );
  }

  private resolveExecutable(
    staticPath: string | null | undefined,
    name: string,
  ): string {
    for (const candidate of [staticPath, name]) {
      if (!candidate) continue;
      try {
        execFileSync(candidate, ['-version'], {
          stdio: 'ignore',
          timeout: 5_000,
        });
        return candidate;
      } catch {
        // A bundled path can exist while its binary is missing or incompatible
        // with this CPU. Try the installed PATH binary, as media fixtures do.
      }
    }
    const message = `BinaryValidationService ${name} has no executable bundled or PATH binary.`;
    this.loggerService.error(message);
    throw new Error(message);
  }

  /**
   * Get validated binary paths
   */
  getBinaryPaths(): { ffmpegPath: string; ffprobePath: string } {
    if (
      !BinaryValidationService.validated ||
      !BinaryValidationService.binaryPaths
    ) {
      throw new Error(
        'Binaries not validated yet. Call validateBinaries() first.',
      );
    }

    return BinaryValidationService.binaryPaths;
  }
}
