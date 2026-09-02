import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { YT_DLP_PROCESS_TIMEOUT_MS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { resolveContainedPath } from '@libs/security';
import { BadRequestException, Injectable } from '@nestjs/common';

const createBadRequest = (message: string) => new BadRequestException(message);

// Download audio from a YouTube video

@Injectable()
export class YtDlpService {
  constructor(private readonly logger: LoggerService) {}

  public downloadAudio(url: string): Promise<string> {
    const outputDir = resolveContainedPath(
      FILES_TMP_ROOT,
      'clips',
      createBadRequest,
    );
    this.ensureOutputDir(outputDir);

    const timestamp = Date.now();
    const outputTemplate = path.join(outputDir, `${timestamp}.%(ext)s`);
    const outputFile = path.join(outputDir, `${timestamp}.mp3`);

    const args = ['-x', '--audio-format', 'mp3', '-o', outputTemplate, url];

    return this.runYtDlp(args, outputFile);
  }

  public downloadVideo(url: string, outputPath?: string): Promise<string> {
    const containedOutputPath = outputPath
      ? resolveContainedPath(FILES_TMP_ROOT, outputPath, createBadRequest)
      : undefined;
    const outputDir = containedOutputPath
      ? path.dirname(containedOutputPath)
      : resolveContainedPath(FILES_TMP_ROOT, 'clips', createBadRequest);
    this.ensureOutputDir(outputDir);

    const timestamp = Date.now();
    const outputTemplate =
      containedOutputPath || path.join(outputDir, `${timestamp}.%(ext)s`);
    const expectedOutput =
      containedOutputPath || path.join(outputDir, `${timestamp}.mp4`);

    const args = [
      '--no-playlist',
      '--socket-timeout',
      '30',
      '--max-filesize',
      '10G',
      '-f',
      'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      url,
    ];

    return this.runYtDlp(args, expectedOutput);
  }

  public downloadAudioLowestQuality(
    url: string,
    outputPath: string,
  ): Promise<string> {
    const containedOutputPath = resolveContainedPath(
      FILES_TMP_ROOT,
      outputPath,
      createBadRequest,
    );
    const outputDir = path.dirname(containedOutputPath);
    this.ensureOutputDir(outputDir);

    const args = [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '9',
      '-o',
      containedOutputPath,
      url,
    ];

    return this.runYtDlp(args, containedOutputPath);
  }

  private ensureOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  private runYtDlp(args: string[], outputPath: string): Promise<string> {
    this.logger.log('yt-dlp media acquisition started', {
      operation: args.includes('-x') ? 'audio' : 'video',
    });

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args, {
        detached: process.platform !== 'win32',
      });
      let isSettled = false;
      let hasTimedOut = false;
      const settle = (callback: () => void): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        callback();
      };
      const timeout = setTimeout(() => {
        hasTimedOut = true;
        this.terminateProcessTree(proc);
      }, YT_DLP_PROCESS_TIMEOUT_MS);

      proc.on('close', (code: number | null) => {
        clearTimeout(timeout);
        if (hasTimedOut) {
          this.cleanupPartialOutput(outputPath);
          settle(() =>
            reject(
              new Error(
                `yt-dlp timed out after ${YT_DLP_PROCESS_TIMEOUT_MS}ms`,
              ),
            ),
          );
          return;
        }

        if (code === 0) {
          if (!fs.existsSync(outputPath)) {
            this.cleanupPartialOutput(outputPath);
            settle(() =>
              reject(
                new Error(
                  'yt-dlp exited successfully without creating an output file',
                ),
              ),
            );
            return;
          }
          settle(() => resolve(outputPath));
        } else {
          this.cleanupPartialOutput(outputPath);
          settle(() => reject(new Error(`yt-dlp exited with code ${code}`)));
        }
      });
      proc.on('error', (error) => {
        clearTimeout(timeout);
        if (!hasTimedOut) {
          settle(() => reject(error));
        }
      });
    });
  }

  private terminateProcessTree(proc: ChildProcess): void {
    if (process.platform !== 'win32' && proc.pid) {
      try {
        process.kill(-proc.pid, 'SIGKILL');
        return;
      } catch (error: unknown) {
        this.logger.warn('Failed to terminate yt-dlp process group', {
          error,
          pid: proc.pid,
        });
      }
    }

    proc.kill('SIGKILL');
  }

  /**
   * Remove the expected output, its `.part` fragment, and any sibling files
   * that share the same basename stem. Downloads that use a `%(ext)s` template
   * can leave intermediate containers (e.g. `.webm` / `.m4a`) even when the
   * resolved expected path is hardcoded to `.mp3` / `.mp4`.
   */
  private cleanupPartialOutput(outputPath: string): void {
    const candidates = new Set<string>([outputPath, `${outputPath}.part`]);
    const dir = path.dirname(outputPath);
    const stem = path.basename(outputPath, path.extname(outputPath));

    try {
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          if (name === stem || name.startsWith(`${stem}.`)) {
            candidates.add(path.join(dir, name));
          }
        }
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to list yt-dlp output directory for cleanup', {
        error,
        outputDir: dir,
      });
    }

    for (const partialPath of candidates) {
      try {
        if (fs.existsSync(partialPath)) {
          fs.unlinkSync(partialPath);
        }
      } catch (error: unknown) {
        this.logger.warn('Failed to clean timed-out yt-dlp output', {
          error,
          outputPath: partialPath,
        });
      }
    }
  }
}
