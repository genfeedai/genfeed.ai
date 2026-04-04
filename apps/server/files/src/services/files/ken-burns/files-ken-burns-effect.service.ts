import fs from 'node:fs';
import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { SlideText, Word } from '@files/shared/interfaces/caption.interface';
import { ImagesToVideoConfig } from '@libs/interfaces/video.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesKenBurnsEffectService {
  private readonly imagesToVideoConfig: ImagesToVideoConfig = {
    outputFps: 30,
    transitionDuration: 0.3,
    zoomFactor: '1',
  };

  constructor(
    private readonly loggerService: LoggerService,
    private readonly ffmpegService: FFmpegService,
    private readonly filesService: FilesService,
    private readonly filesCaptionsService: FilesCaptionsService,
  ) {}

  async generateKenBurnsVideo(
    _websocketURL: string,
    ingredientId: string, // Script or Clip ID
    slideText: SlideText[],
    isClipSelected: boolean,
    fontFamily: string,
    dimensions: { width: number; height: number },
    isWatermarkEnabled: boolean,
  ): Promise<string> {
    const imageFiles = this.filesService.getSortedFiles(
      this.filesService.getPath('images', ingredientId),
      'jpeg',
    );
    if (imageFiles.length === 0) {
      throw new Error('No image files found in the specified directory');
    }

    const slidePaths = await this.generateSlides(
      _websocketURL,
      ingredientId,
      imageFiles,
      this.filesService.getPath('slides', ingredientId),
      slideText,
      dimensions,
    );

    return await this.concatSlidesWithTransitions(
      _websocketURL,
      ingredientId,
      slidePaths,
      slideText,
      this.filesService.getPath(
        isClipSelected ? 'clips' : 'output',
        ingredientId,
      ),
      dimensions,
      fontFamily,
      isWatermarkEnabled,
    );
  }

  private getZoomDirection(index: number): string {
    const presets = [
      `x='0':y='ih/2'`,
      `x='iw/2':y='0'`,
      `x='iw/4':y='ih/4'`,
      `x='(iw/2)-(iw/zoom/2)':y='(ih/2)-(ih/zoom/2)'`,
    ];
    return presets[index % presets.length];
  }

  private async generateSlides(
    _websocketURL: string,
    ingredientId: string,
    frameFiles: string[],
    outputPath: string,
    slideText: SlideText[],
    dimensions: { width: number; height: number },
  ): Promise<string[]> {
    const slidePaths: string[] = [];

    // await this.websocketService.emit(websocketURL, {
    //   step: 'clips',
    //   status: IngredientStatus.PROCESSING,
    // });

    for (let i = 0; i < frameFiles.length; i++) {
      const file = frameFiles[i];
      const slidePath = path.join(outputPath, `frame_${i}.mp4`);
      const direction = this.getZoomDirection(i);

      await this.generateSlide(
        path.join(this.filesService.getPath('images', ingredientId), file),
        direction,
        slidePath,
        slideText[i].duration,
        dimensions,
      );

      slidePaths.push(slidePath);
    }

    // await this.websocketService.emit(websocketURL, {
    //   step: 'clips',
    //   status: 'completed',
    // });

    return slidePaths;
  }

  private async generateSlide(
    inputPath: string,
    direction: string,
    outputPath: string,
    duration: number,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    this.loggerService.log(`Started FFmpeg slide generation for ${outputPath}`);

    try {
      await this.ffmpegService.generateKenBurnsSlide(inputPath, outputPath, {
        dimensions,
        duration,
        fps: this.imagesToVideoConfig.outputFps,
        zoomDirection: direction,
        zoomFactor: this.imagesToVideoConfig.zoomFactor,
      });

      this.loggerService.log(`Finished processing ${outputPath}`);
    } catch (error: unknown) {
      this.loggerService.error(`Error processing ${outputPath}:`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async concatSlidesWithTransitions(
    _websocketURL: string,
    ingredientId: string,
    slidePaths: string[],
    slideText: SlideText[],
    outputPath: string,
    dimensions: { width: number; height: number },
    fontFamily: string,
    isWatermarkEnabled: boolean,
  ): Promise<string> {
    const tempVideoPath = path.join(outputPath, `${ingredientId}_temp.mp4`);
    let finalVideoPath = path.join(outputPath, `final.mp4`);

    this.loggerService.log('Started transition merge');

    // Adjust total duration based on the number of transitions between slides
    const totalDuration =
      slideText.reduce((acc, curr) => acc + curr.duration, 0) -
      this.imagesToVideoConfig.transitionDuration *
        Math.max(slidePaths.length - 1, 0);

    try {
      await this.ffmpegService.createKenBurnsVideoWithTransitions(
        slidePaths,
        tempVideoPath,
        {
          dimensions,
          fps: this.imagesToVideoConfig.outputFps,
          slideTexts: slideText,
          totalDuration,
          transitionDuration: this.imagesToVideoConfig.transitionDuration,
        },
      );

      this.loggerService.log('Finished transition merge');

      await this.addAudios(
        _websocketURL,
        ingredientId,
        tempVideoPath,
        finalVideoPath,
        slideText,
        fontFamily,
        dimensions,
      );

      if (isWatermarkEnabled) {
        finalVideoPath = await this.filesService.addWatermark(
          finalVideoPath,
          dimensions,
        );
      }

      this.loggerService.log(`✅ Video generated at: ${finalVideoPath}`);

      return finalVideoPath;
    } catch (error: unknown) {
      this.loggerService.error('Error in slide processing', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async addAudios(
    _websocketURL: string,
    ingredientId: string,
    inputPath: string,
    outputPath: string,
    slideText: SlideText[],
    fontFamily: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    const voiceDir = this.filesService.getPath('voices', ingredientId);
    const voiceFiles = fs
      .readdirSync(voiceDir)
      .filter((f) => f.endsWith('.mp3'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const bNum = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return aNum - bNum;
      });
    const srtFiles = voiceFiles.map((file) => file.replace(/\.mp3$/, '.srt'));

    // await this.websocketService.emit(websocketURL, {
    //   step: 'audio',
    //   status: IngredientStatus.PROCESSING,
    // });

    this.loggerService.log('Started adding audio');

    try {
      const musicPath = path.resolve(
        this.filesService.getPath('musics', ingredientId),
        'frame-0.mp3',
      );

      const voicePaths = voiceFiles.map((file) => path.join(voiceDir, file));

      // Generate array of words from SRT files
      const words: Word[] = [];
      let captionOffset = 0;
      for (let i = 0; i < srtFiles.length; i++) {
        const filePath = path.join(voiceDir, srtFiles[i]);
        if (fs.existsSync(filePath)) {
          const parsed = this.filesCaptionsService.filterCaptions(
            fs.readFileSync(filePath, 'utf8'),
          );
          parsed.forEach((w) =>
            words.push({
              end: w.end + captionOffset * 1000,
              start: w.start + captionOffset * 1000,
              text: w.text,
            }),
          );
        }
        captionOffset += slideText[i].duration;
      }

      const filters: string[] = this.filesCaptionsService.getDrawtextFilters(
        fontFamily,
        words,
        dimensions,
      );

      filters.push(
        ...this.filesCaptionsService.getOverlayDrawtextFilters(
          fontFamily,
          slideText,
          dimensions,
        ),
      );

      await this.ffmpegService.addComplexAudioMix(inputPath, outputPath, {
        filters,
        musicPath,
        musicVolume: 0.05,
        slideTexts: slideText,
        voicePaths,
      });

      this.loggerService.log('Finished audio processing');

      // await this.websocketService.emit(websocketURL, {
      //   step: 'audio',
      //   status: 'completed',
      // });
    } catch (error: unknown) {
      this.loggerService.error('Error adding audio', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async applyKenBurnsEffect(
    _imageUrl: string,
    duration: number,
    ingredientId: string,
    options?: unknown,
  ): Promise<string> {
    const slideText: SlideText[] = options?.slideText || [
      {
        duration: duration,
        overlayText: '',
        voiceText: '',
      },
    ];
    const isClipSelected = options?.isClipSelected || false;
    const fontFamily = options?.fontFamily || 'montserrat-black';
    const dimensions = options?.dimensions || { height: 1920, width: 1080 };
    const isWatermarkEnabled = options?.isWatermarkEnabled || false;
    const _websocketURL = options?.websocketURL || '';

    return this.generateKenBurnsVideo(
      _websocketURL,
      ingredientId,
      slideText,
      isClipSelected,
      fontFamily,
      dimensions,
      isWatermarkEnabled,
    );
  }
}
