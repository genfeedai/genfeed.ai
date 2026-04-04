import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@files/config/config.service';
import { ffmpegEscapeString } from '@files/helpers/utils/string/string.util';
import { FilesService } from '@files/services/files/files.service';
import { SlideText, Word } from '@files/shared/interfaces/caption.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';

@Injectable()
export class FilesCaptionsService extends FilesService {
  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,
  ) {
    super(configService, loggerService, httpService);
  }

  private readonly execFileAsync = promisify(execFile);

  private executeFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath || '', args);
      proc.on('close', (code: unknown) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  private async probeVideo(filePath: string): Promise<unknown> {
    const { stdout } = await this.execFileAsync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);
    return JSON.parse(stdout);
  }

  private parseTimeToMs(time: string): number {
    const [hour, minute, rest] = time.split(':');
    const [second, milli] = rest.split(',');
    return (
      Number(hour) * 3600 * 1000 +
      Number(minute) * 60 * 1000 +
      Number(second) * 1000 +
      Number(milli)
    );
  }

  public async addCaptionsToVideo(
    inputFolder: string,
    ingredientId: string,
    videoFile: string,
    srtContent: string,
    fontFamily = 'montserrat-black',
  ): Promise<string> {
    const inputPath = path.join(
      this.getPath(inputFolder, ingredientId),
      videoFile,
    );

    const outputPath = path.join(
      this.getPath('output', ingredientId),
      'captions.mp4',
    );

    const words = this.filterCaptions(srtContent);

    const metaData = await this.probeVideo(inputPath);
    const stream = metaData.streams.find((s: unknown) => s.width && s.height);
    const meta = { height: stream?.height || 0, width: stream?.width || 0 };

    const filters = this.getDrawtextFilters(fontFamily, words, meta);

    const args = [
      '-i',
      inputPath,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vFinal]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      outputPath,
    ];

    this.loggerService.log(`ffmpeg ${args.join(' ')}`);
    await this.executeFfmpeg(args);

    this.loggerService.log('Finished caption overlay');
    this.loggerService.log(`✅ Video generated at: ${outputPath}`);
    return outputPath;
  }

  public filterCaptions(srtContent: string): Word[] {
    const blocks = srtContent.trim().split(/\r?\n\r?\n/);
    const words: Word[] = [];

    blocks.forEach((block) => {
      const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return;
      }

      // Remove index line if present
      if (/^\d+$/.test(lines[0])) {
        lines.shift();
      }

      const timeLine = lines.shift();
      const textLine = lines.join(' ');
      const [start, end] = timeLine?.split(' --> ').map((t) => t.trim()) || [];

      const startMs = this.parseTimeToMs(start);
      const endMs = this.parseTimeToMs(end);

      // Split caption into words
      const wordArr = textLine.split(/\s+/).filter(Boolean);
      const wordCount = wordArr.length;
      const wordDuration = wordCount > 0 ? (endMs - startMs) / wordCount : 0;

      wordArr.forEach((word, i) => {
        const wordStart = Math.round(startMs + i * wordDuration);
        const wordEnd = Math.round(startMs + (i + 1) * wordDuration);

        words.push({
          end: wordEnd,
          start: wordStart,
          text: ffmpegEscapeString(word).toUpperCase(),
        });
      });
    });

    return words;
  }

  public filterCaptionsByWord(srtContent: string): Word[] {
    const blocks = srtContent.trim().split(/\r?\n\r?\n/);
    const words: Word[] = [];

    blocks.forEach((block) => {
      const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return;
      }

      if (/^\d+$/.test(lines[0])) {
        lines.shift();
      }

      const timeLine = lines.shift();
      const textLine = lines.join(' ');
      const [start, end] = timeLine?.split(' --> ').map((t) => t.trim()) || [];
      const startMs = this.parseTimeToMs(start);
      const endMs = this.parseTimeToMs(end);
      const wordsArr = textLine.split(/\s+/).filter((w) => w.length > 0);
      const duration = (endMs - startMs) / wordsArr.length;

      wordsArr.forEach((word, index) => {
        const wordStart = startMs + duration * index;
        const wordEnd = wordStart + duration;
        words.push({
          end: Math.round(wordEnd),
          start: Math.round(wordStart),
          text: ffmpegEscapeString(word).toUpperCase(),
        });
      });
    });

    return words;
  }

  public getDrawtextFilters(
    fontFamily: string,
    words: Word[],
    dimensions?: { width: number; height: number },
  ): string[] {
    // The font file is determined by the provided `fontFamily` parameter.
    // If no value is given, fall back to the default font.
    const fontfile = path.resolve(
      'public',
      'assets',
      'fonts',
      `${fontFamily || 'montserrat-black'}.ttf`,
    );

    const videoHeight = dimensions?.height || 1920;
    const fontsize = Math.round(videoHeight * 0.0625); // ~6.25% of height
    const fontcolor = 'white';
    const yOffset = Math.round(videoHeight * 0.234375); // ~23% of height
    const y = `h-${yOffset}`;

    return words.map((word, idx) => {
      // Escape single quotes in the text for FFmpeg
      const startSec = (word.start / 1000).toFixed(2);
      const endSec = (word.end / 1000).toFixed(2);

      // Labels for filter chaining
      const inputLabel = idx === 0 ? '[0:v]' : `[v${idx}]`;
      const outputLabel =
        idx === words.length - 1 ? '[vFinal]' : `[v${idx + 1}]`;

      // Build the drawtext filter
      return (
        `${inputLabel}drawtext=` +
        `fontfile='${fontfile}':` +
        `borderw='5':bordercolor='black':` +
        `text='${word.text}':` +
        `enable='between(t,${startSec},${endSec})':` +
        `x='(w-text_w)/2':y='${y}':` +
        `fontsize='${fontsize}':fontcolor='${fontcolor}'` +
        outputLabel
      );
    });
  }

  public getOverlayDrawtextFilters(
    fontFamily: string,
    slides: SlideText[],
    dimensions?: { width: number; height: number },
  ): string[] {
    const fontfile = path.resolve(
      'public',
      'assets',
      'fonts',
      `${fontFamily || 'montserrat-black'}.ttf`,
    );

    const videoHeight = dimensions?.height || 1920;
    const fontsize = Math.round(videoHeight * 0.0625);
    const fontcolor = 'white';
    const yOffset = Math.round(videoHeight * 0.1);
    const y = `${yOffset}`;

    const filters: string[] = [];
    let currentLabel = 'vFinal';
    let start = 0;

    slides.forEach((slide, idx) => {
      if (!slide.overlayText) {
        start += slide.duration;
        return;
      }

      const startSec = start.toFixed(2);
      const endSec = (start + slide.duration).toFixed(2);
      const output = idx === slides.length - 1 ? 'vFinal' : `ov${idx}`;

      filters.push(
        `[${currentLabel}]drawtext=` +
          `fontfile='${fontfile}':` +
          `borderw='5':bordercolor='black':` +
          `text='${ffmpegEscapeString(slide.overlayText)}':` +
          `enable='between(t,${startSec},${endSec})':` +
          `x='(w-text_w)/2':y='${y}':` +
          `fontsize='${fontsize}':fontcolor='${fontcolor}'` +
          `[${output}]`,
      );

      currentLabel = output;
      start += slide.duration;
    });

    if (filters.length > 0 && currentLabel !== 'vFinal') {
      // Ensure final output label is vFinal
      filters.push(`[${currentLabel}]copy[vFinal]`);
    }

    return filters;
  }

  public async generateCaptions(
    _videoUrl: string,
    captions: string,
    ingredientId: string,
  ): Promise<string> {
    const inputFolder = 'videos';
    const videoFile = 'input.mp4';
    const fontFamily = 'montserrat-black';

    const outputPath = await this.addCaptionsToVideo(
      inputFolder,
      ingredientId,
      videoFile,
      captions,
      fontFamily,
    );

    return outputPath;
  }
}
