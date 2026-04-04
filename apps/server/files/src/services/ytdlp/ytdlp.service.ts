import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// Download audio from a YouTube video

@Injectable()
export class YtDlpService {
  constructor(private readonly logger: LoggerService) {}

  public downloadAudio(url: string): Promise<string> {
    const outputDir = path.resolve('public', 'tmp', 'clips');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputTemplate = path.join(outputDir, `${timestamp}.%(ext)s`);
    const outputFile = path.join(outputDir, `${timestamp}.mp3`);

    const args = ['-x', '--audio-format', 'mp3', '-o', outputTemplate, url];

    this.logger.log(`yt-dlp ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputFile);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  public downloadVideo(url: string, outputPath?: string): Promise<string> {
    const outputDir = outputPath
      ? path.dirname(outputPath)
      : path.resolve('public', 'tmp', 'clips');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const outputTemplate =
      outputPath || path.join(outputDir, `${timestamp}.%(ext)s`);
    const expectedOutput =
      outputPath || path.join(outputDir, `${timestamp}.mp4`);

    const args = [
      '-f',
      'bestvideo[height<=720]+bestaudio/best[height<=720]',
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      url,
    ];

    this.logger.log(`yt-dlp ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(expectedOutput);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  public downloadAudioLowestQuality(
    url: string,
    outputPath: string,
  ): Promise<string> {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const args = [
      '-x', // Extract audio
      '--audio-format',
      'mp3', // Convert to MP3
      '--audio-quality',
      '9', // Lowest quality (0-9, 9 = worst)
      '-o',
      outputPath,
      url,
    ];

    this.logger.log(`yt-dlp ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }
}
