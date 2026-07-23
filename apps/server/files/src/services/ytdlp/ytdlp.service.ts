import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { YT_DLP_PROCESS_TIMEOUT_MS } from '@genfeedai/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// Download audio from a YouTube video

@Injectable()
export class YtDlpService {
  constructor(private readonly logger: LoggerService) {}

  public downloadAudio(url: string): Promise<string> {
    const outputDir = path.resolve('public', 'tmp', 'clips');
    this.ensureOutputDir(outputDir);

    const timestamp = Date.now();
    const outputTemplate = path.join(outputDir, `${timestamp}.%(ext)s`);
    const outputFile = path.join(outputDir, `${timestamp}.mp3`);

    const args = ['-x', '--audio-format', 'mp3', '-o', outputTemplate, url];

    return this.runYtDlp(args, outputFile);
  }

  public downloadVideo(url: string, outputPath?: string): Promise<string> {
    const outputDir = outputPath
      ? path.dirname(outputPath)
      : path.resolve('public', 'tmp', 'clips');
    this.ensureOutputDir(outputDir);

    const timestamp = Date.now();
    const outputTemplate =
      outputPath || path.join(outputDir, `${timestamp}.%(ext)s`);
    const expectedOutput =
      outputPath || path.join(outputDir, `${timestamp}.mp4`);

    const args = [
      '--no-playlist',
      '--socket-timeout',
      '30',
      '--max-filesize',
      '500M',
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
    const outputDir = path.dirname(outputPath);
    this.ensureOutputDir(outputDir);

    const args = [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '9',
      '-o',
      outputPath,
      url,
    ];

    return this.runYtDlp(args, outputPath);
  }

  private ensureOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  private runYtDlp(args: string[], outputPath: string): Promise<string> {
    this.logger.log(`yt-dlp ${args.join(' ')}`);

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

  private cleanupPartialOutput(outputPath: string): void {
    for (const partialPath of [outputPath, `${outputPath}.part`]) {
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
