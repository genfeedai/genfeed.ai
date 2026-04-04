import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@files/config/config.service';
import type { SlideText } from '@files/shared/interfaces/caption.interface';
import { MetadataExtension } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';

@Injectable()
export class FilesService {
  public readonly isDeleteTempFilesEnabled: boolean = true;

  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,
  ) {}

  public getPath(type: string, ingredientId: string) {
    const assetsPath = path.resolve('public', 'tmp', type, ingredientId);

    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath, { recursive: true });
    }

    return assetsPath;
  }

  public async resizeImage(
    input: Buffer,
    target: { width: number; height: number },
  ): Promise<Buffer> {
    return sharp(input)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize(target.width, target.height, { fit: 'cover' })
      .toBuffer();
  }

  public async resizeVideo(
    inputPath: string,
    target: { width: number; height: number },
  ): Promise<string> {
    const outputPath = path.resolve(
      'public',
      'tmp',
      `${path.basename(inputPath, path.extname(inputPath))}_resized.mp4`,
    );
    const args = [
      '-i',
      inputPath,
      '-vcodec',
      'libx264',
      '-acodec',
      'aac',
      '-vf',
      `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2`,
      '-y',
      outputPath,
    ];

    try {
      await this.runFfmpeg(args);
      return outputPath;
    } catch (error: unknown) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public getSortedFiles(imagesPath: string, extension: string): string[] {
    return fs
      .readdirSync(imagesPath)
      .filter((file) => file.endsWith(`.${extension}`))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });
  }

  public cleanupTempFiles(ingredientId: string, isDeleteOutputEnabled = false) {
    try {
      const tempDirs = [
        'clips',
        'image-to-videos',
        'images',
        'musics',
        'slides',
        'voices',
      ];

      if (isDeleteOutputEnabled) {
        tempDirs.push('output');
      }

      for (const dir of tempDirs) {
        const dirPath = this.getPath(dir, ingredientId);
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { force: true, recursive: true });
          this.loggerService.log(
            `Cleaned up ${dir} directory for ingredient ${ingredientId}`,
          );
        }
      }
    } catch (error: unknown) {
      this.loggerService.error('Error during cleanup', error);
    }
  }

  private runFfmpeg(args: string[]): Promise<void> {
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

  public async prepareAllFiles(
    ingredientId: string,
    frames: unknown[],
    musicId: string,
  ) {
    const images: unknown[] = frames.map((frame: unknown) => frame.image);
    const voices: unknown[] = frames.map((frame: unknown) => frame.voice);
    const imageToVideos: unknown[] = frames
      .map((frame: unknown) => frame.imageToVideo)
      .filter((item) => item !== undefined);

    const captions: SlideText[] = frames.map((frame: unknown) => ({
      duration: frame.duration,
      overlayText: frame.overlayText,
      voiceText: frame.voiceText,
    }));

    // 1 - Save all images OR image-to-videos clips
    if (imageToVideos.length > 0) {
      this.loggerService.log('Downloading all image to videos');
      for (let i = 0; i < imageToVideos.length; i++) {
        await this.downloadFile(
          ingredientId,
          'image-to-videos',
          imageToVideos[i],
          i,
        );
      }
    } else {
      // 1 - Save all frames
      this.loggerService.log('Downloading all images');
      for (let i = 0; i < images.length; i++) {
        await this.downloadFile(ingredientId, 'images', images[i], i);
      }
    }

    // 2 - Save all voices
    this.loggerService.log('Downloading all voices');
    for (let i = 0; i < voices.length; i++) {
      await this.downloadFile(ingredientId, 'voices', voices[i], i);
    }

    // 3 - Save background music from script variable
    if (musicId) {
      this.loggerService.log('Downloading background music');
      await this.downloadFile(ingredientId, 'musics', musicId, 0);
    }

    this.loggerService.log(`All ${ingredientId} files downloaded`);

    return {
      captions,
      images,
      imageToVideos,
      voices,
    };
  }

  public async downloadFile(
    scriptId: string,
    type: string,
    ingredientId: string,
    index: number,
  ): Promise<string> {
    const url = `${this.configService.ingredientsEndpoint}/${type}/${ingredientId}`;

    try {
      const tmpDir = this.getPath(type, scriptId);
      const extension = this.getExtensionForType(type);
      const filename = `frame-${index}.${extension}`;
      const filePath = path.join(tmpDir, filename);

      // Download the file
      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'arraybuffer',
        }),
      );

      const buffer = Buffer.from(response.data);

      if (type === 'images' || type === 'trainings') {
        await sharp(buffer)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize({ width: 1080, withoutEnlargement: true })
          .jpeg({
            quality: Number(this.configService.get('AWS_IMAGE_COMPRESSION')),
          })
          .toFile(filePath);
      } else {
        fs.writeFileSync(filePath, buffer);
      }

      return filePath;
    } catch (error: unknown) {
      this.loggerService.error(`Failed to download file from ${url}`, error);
      throw new Error(
        `Failed to download file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async addWatermark(
    inputPath: string,
    dimensions: { width: number; height: number },
    text = '@genfeedai',
  ): Promise<string> {
    const fontfile = path.resolve(
      'public',
      'assets',
      'fonts',
      'montserrat-black.ttf',
    );

    const fontsize = Math.round((dimensions.height || 1080) * 0.02);

    const { dir, name, ext } = path.parse(inputPath);
    const outputPath = path.join(dir, `${name}_watermark${ext}`);

    const args = [
      '-i',
      inputPath,
      '-vf',
      `drawtext=fontfile='${fontfile}':text='${text}':fontcolor=white@0.5:fontsize=${fontsize}:x=w-tw-50:y=50`,
      '-y',
      outputPath,
    ];

    this.loggerService.log(`ffmpeg ${args.join(' ')}`);

    await this.runFfmpeg(args);

    this.loggerService.log('Finished watermark overlay');

    return outputPath;
  }

  public async addTextOverlay(
    ingredientId: string,
    url: string,
    text: string,
    position: 'top' | 'center' | 'bottom' = 'top',
    dimensions?: { width: number; height: number },
  ): Promise<string> {
    const inputDir = this.getPath('videos', ingredientId);
    const inputPath = path.join(inputDir, 'source.mp4');

    const outputDir = this.getPath('output', ingredientId);
    const outputPath = path.join(outputDir, 'text_overlay.mp4');

    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'arraybuffer' }),
    );
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    try {
      const fontfile = path.resolve(
        'public',
        'assets',
        'fonts',
        'montserrat-bold.ttf',
      );

      // Use provided dimensions or get video dimensions using ffprobe
      let videoHeight = dimensions?.height || 1080;

      if (!dimensions) {
        const execFileAsync = promisify(execFile);

        try {
          const { stdout } = await execFileAsync('ffprobe', [
            '-v',
            'error',
            '-print_format',
            'json',
            '-show_streams',
            '-show_format',
            inputPath,
          ]);
          const probe = JSON.parse(stdout);
          const stream = probe.streams?.find(
            (s: unknown) => s.width && s.height,
          );
          videoHeight = stream?.height || 1080;
        } catch (error: unknown) {
          this.loggerService.error(
            'Failed to get video metadata, using defaults',
            error,
          );
        }
      }

      // Calculate font size based on video height (larger for better visibility)
      const fontsize = Math.round(videoHeight * 0.06);

      // Calculate Y position based on position parameter
      let yPosition: string;
      switch (position) {
        case 'top':
          yPosition = '50';
          break;
        case 'center':
          yPosition = '(h-text_h)/2';
          break;
        case 'bottom':
          yPosition = 'h-text_h-50';
          break;
        default:
          yPosition = '50';
      }

      // Escape special characters in text for ffmpeg
      const escapedText = text.replace(/'/g, "\\'").replace(/:/g, '\\:');

      const args = [
        '-i',
        inputPath,
        '-vf',
        `drawtext=fontfile='${fontfile}':text='${escapedText}':fontcolor=white:fontsize=${fontsize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.5:boxborderw=10`,
        '-codec:a',
        'copy',
        '-y',
        outputPath,
      ];

      this.loggerService.log(`ffmpeg ${args.join(' ')}`);

      await this.runFfmpeg(args);

      this.loggerService.log(`Text overlay added at: ${outputPath}`);
    } catch (error: unknown) {
      this.loggerService.error('Error adding text overlay', error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      if (this.isDeleteTempFilesEnabled && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    }

    return outputPath;
  }

  public async reverseVideo(
    ingredientId: string,
    url: string,
  ): Promise<string> {
    const inputDir = this.getPath('videos', ingredientId);
    const inputPath = path.join(inputDir, 'source.mp4');

    const outputDir = this.getPath('output', ingredientId);
    const outputPath = path.join(outputDir, 'reversed.mp4');

    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'arraybuffer' }),
    );
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    try {
      const args = [
        '-i',
        inputPath,
        '-vf',
        'reverse',
        '-af',
        'areverse',
        '-y',
        outputPath,
      ];

      this.loggerService.log(`ffmpeg ${args.join(' ')}`);

      await this.runFfmpeg(args);

      this.loggerService.log(`Video reversed at: ${outputPath}`);
    } catch (error: unknown) {
      this.loggerService.error('Error reversing video', error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      if (this.isDeleteTempFilesEnabled && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    }

    return outputPath;
  }

  public async mirrorVideo(ingredientId: string, url: string): Promise<string> {
    const inputDir = this.getPath('videos', ingredientId);
    const inputPath = path.join(inputDir, 'source.mp4');

    const outputDir = this.getPath('output', ingredientId);
    const outputPath = path.join(outputDir, 'mirrored.mp4');

    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'arraybuffer' }),
    );
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    try {
      const args = [
        '-i',
        inputPath,
        '-vf',
        'hflip',
        '-c:a',
        'copy',
        '-y',
        outputPath,
      ];

      this.loggerService.log(`ffmpeg ${args.join(' ')}`);

      await this.runFfmpeg(args);

      this.loggerService.log(`Video mirrored at: ${outputPath}`);
    } catch (error: unknown) {
      this.loggerService.error('Error mirroring video', error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      if (this.isDeleteTempFilesEnabled && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
      }
    }

    return outputPath;
  }

  public async convertToPortrait(
    inputType: string,
    ingredientId: string,
    videoFile: string,
    dimensions: { width: number; height: number } = {
      height: 1920,
      width: 1080,
    },
  ): Promise<string> {
    const outputDir = this.getPath('portraits', ingredientId);
    const outputPath = path.join(outputDir, 'portrait.mp4');
    const inputPath = path.join(
      this.getPath(inputType, ingredientId),
      videoFile,
    );

    const filter = [
      'crop=ih*9/16:ih:(iw-ih*9/16)/2:0',
      `scale=${dimensions.width}:${dimensions.height}`,
    ].join(',');

    const args = [
      '-i',
      inputPath,
      '-vf',
      filter,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      outputPath,
    ];

    this.loggerService.log(`ffmpeg ${args.join(' ')}`);

    await this.runFfmpeg(args);

    this.loggerService.log('Finished portrait conversion');
    this.loggerService.log(`Video generated at: ${outputPath}`);

    return outputPath;
  }

  public async extractFirstAndLastFrames(
    ingredientId: string,
    videoFile: string,
  ): Promise<{ first: string; last: string }> {
    const inputPath = path.join(
      this.getPath('videos', ingredientId),
      videoFile,
    );
    const outputDir = this.getPath('output', ingredientId);
    const firstFramePath = path.join(outputDir, 'first.jpg');
    const lastFramePath = path.join(outputDir, 'last.jpg');

    await this.runFfmpeg([
      '-i',
      inputPath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      firstFramePath,
    ]);
    await this.runFfmpeg([
      '-sseof',
      '-0.1',
      '-i',
      inputPath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      lastFramePath,
    ]);

    return { first: firstFramePath, last: lastFramePath };
  }

  public async getVideoMetadata(videoPath: string): Promise<unknown> {
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        videoPath,
      ]);
      return JSON.parse(stdout);
    } catch (error: unknown) {
      this.loggerService.error('Failed to get video metadata', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async extractFrames(
    videoPath: string,
    outputDir: string,
    fps: number = 1,
  ): Promise<string[]> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPattern = path.join(outputDir, 'frame-%04d.jpg');

    await this.runFfmpeg(['-i', videoPath, '-vf', `fps=${fps}`, outputPattern]);

    const frames = fs
      .readdirSync(outputDir)
      .filter((file) => file.startsWith('frame-') && file.endsWith('.jpg'))
      .sort();

    return frames.map((frame) => path.join(outputDir, frame));
  }

  private getExtensionForType(type: string): string {
    switch (type) {
      case 'images':
      case 'trainings':
        return 'jpeg';
      case 'videos':
      case 'image-to-videos':
      case 'clips':
        return MetadataExtension.MP4;
      case 'voices':
      case 'musics':
        return 'mp3';
      default:
        return 'mp3';
    }
  }

  public async mergeVideos(
    videoPaths: string[],
    outputPath: string,
  ): Promise<string> {
    const listFile = path.join(path.dirname(outputPath), 'list.txt');
    const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');

    fs.writeFileSync(listFile, listContent);

    try {
      await this.runFfmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c',
        'copy',
        outputPath,
      ]);

      if (fs.existsSync(listFile)) {
        fs.unlinkSync(listFile);
      }

      return outputPath;
    } catch (error: unknown) {
      if (fs.existsSync(listFile)) {
        fs.unlinkSync(listFile);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
