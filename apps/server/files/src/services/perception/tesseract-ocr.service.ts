import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

const execFileAsync = promisify(execFile);

/** Upper bound on OCR text kept per frame; on-screen text is short. */
const MAX_OCR_TEXT_LENGTH = 2_000;
const OCR_TIMEOUT_MS = 30_000;

/** Raised when the `tesseract` binary is not installed on this host. */
export class OcrEngineUnavailableError extends Error {
  constructor() {
    super('The tesseract OCR engine is not installed on this host');
    this.name = 'OcrEngineUnavailableError';
  }
}

/**
 * Local OCR over sampled frames (#4879) through the `tesseract` CLI.
 *
 * Runs on the files host with no network call, so perception still produces
 * OCR text when every hosted provider is down. The container images install
 * `tesseract-ocr`; a host without it reports the artefact as unavailable
 * rather than failing perception.
 */
@Injectable()
export class TesseractOcrService {
  constructor(private readonly logger: LoggerService) {}

  async recognize(imagePath: string): Promise<string> {
    try {
      // Page segmentation mode 11 ("sparse text") finds scattered overlay text
      // in video frames better than the default single-block assumption.
      const { stdout } = await execFileAsync(
        'tesseract',
        [imagePath, 'stdout', '-l', 'eng', '--psm', '11'],
        { maxBuffer: 1024 * 1024, timeout: OCR_TIMEOUT_MS },
      );
      return TesseractOcrService.normalize(stdout);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new OcrEngineUnavailableError();
      }
      this.logger.warn(
        `TesseractOcrService recognition failed: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /** Collapse tesseract's blank-line-heavy output into trimmed lines. */
  static normalize(raw: string): string {
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .slice(0, MAX_OCR_TEXT_LENGTH);
  }
}
