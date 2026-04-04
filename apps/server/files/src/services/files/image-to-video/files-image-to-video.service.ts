import fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { SlideText } from '@files/shared/interfaces/caption.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesImageToVideoService extends FilesService {
  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,

    private readonly ffmpegService: FFmpegService,
    private readonly filesCaptionsService: FilesCaptionsService,
  ) {
    super(configService, loggerService, httpService);
  }

  async generateImageToVideo(
    _websocketURL: string,
    ingredientId: string,
    slideText: SlideText[],
    fontFamily: string,
    dimensions: { width: number; height: number },
    isWatermarkEnabled: boolean,
  ): Promise<string> {
    const clipFiles = this.getSortedFiles(
      this.getPath('image-to-videos', ingredientId),
      'mp4',
    );

    if (clipFiles.length === 0) {
      throw new Error('No clip files found in the specified directory');
    }

    // await this.websocketService.emit(websocketURL, {
    //   step: 'audio',
    //   status: IngredientStatus.PROCESSING,
    // });

    const outputDir = this.getPath('output', ingredientId);
    let finalVideoPath = path.join(outputDir, `merged.mp4`);

    // Process each clip with its corresponding audio
    const processedClips = await Promise.all(
      clipFiles.map((clip, index) =>
        this.processClipWithAudio(
          _websocketURL,
          ingredientId,
          clip,
          index,
          outputDir,
          slideText[index],
          fontFamily,
          dimensions,
        ),
      ),
    );

    // await this.websocketService.emit(websocketURL, {
    //   step: 'audio',
    //   status: 'completed',
    // });

    // await this.websocketService.emit(websocketURL, {
    //   step: 'clips',
    //   status: IngredientStatus.PROCESSING,
    // });

    // If there's only one clip, merge it with background music if available
    if (processedClips.length === 1) {
      const musicPath = path.join(
        this.getPath('musics', ingredientId),
        'frame-0.mp3',
      );

      if (fs.existsSync(musicPath)) {
        await this.mergeProcessedClips(
          _websocketURL,
          ingredientId,
          processedClips,
          finalVideoPath,
        );
      } else {
        fs.copyFileSync(processedClips[0], finalVideoPath);

        this.loggerService.log(
          `Single clip copied to final output: ${finalVideoPath}`,
        );
      }
    } else {
      // Merge all processed clips
      await this.mergeProcessedClips(
        _websocketURL,
        ingredientId,
        processedClips,
        finalVideoPath,
      );
    }

    // await this.websocketService.emit(websocketURL, {
    //   step: 'clips',
    //   status: 'completed',
    // });

    if (isWatermarkEnabled) {
      finalVideoPath = await this.addWatermark(finalVideoPath, dimensions);
    }

    this.loggerService.log(`✅ Video generated at: ${finalVideoPath}`);
    return finalVideoPath;
  }

  private async processClipWithAudio(
    _websocketURL: string,
    ingredientId: string,
    clipFile: string,
    index: number,
    outputDir: string,
    slideText: SlideText,
    fontFamily: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    // First scale the video
    const scaledPath = path.join(outputDir, `scaled_${index}.mp4`);
    await this.scaleVideoClip(
      ingredientId,
      clipFile,
      scaledPath,
      dimensions,
      index,
    );

    // Then add audio to the scaled video
    const processedPath = path.join(outputDir, `processed_${index}.mp4`);
    await this.addAudioToClip(
      _websocketURL,
      ingredientId,
      scaledPath,
      processedPath,
      slideText,
      index,
      fontFamily,
      dimensions,
    );

    // Clean up scaled video if needed
    if (this.isDeleteTempFilesEnabled && fs.existsSync(scaledPath)) {
      fs.unlinkSync(scaledPath);
      this.loggerService.log(`Cleaned up temporary scaled file: ${scaledPath}`);
    }

    return processedPath;
  }

  private async scaleVideoClip(
    ingredientId: string,
    clipFile: string,
    outputPath: string,
    dimensions: { width: number; height: number },
    index: number,
  ): Promise<void> {
    this.loggerService.log(`Scaling video ${index + 1}: ${clipFile}`);

    const inputPath = path.join(
      this.getPath('image-to-videos', ingredientId),
      clipFile,
    );

    try {
      await this.ffmpegService.scaleVideo(inputPath, outputPath, dimensions, {
        crf: '23',
        pixelFormat: 'yuv420p',
        preset: 'ultrafast',
        videoCodec: 'libx264',
      });

      this.loggerService.log(`Finished scaling video ${index + 1}`);
    } catch (error: unknown) {
      this.loggerService.error(`Error scaling video ${index + 1}`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async addAudioToClip(
    _websocketURL: string,
    ingredientId: string,
    inputPath: string,
    outputPath: string,
    slideText: SlideText,
    index: number,
    fontFamily: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    const voiceDir = this.getPath('voices', ingredientId);
    const voiceFile = path.join(voiceDir, `frame-${index}.mp3`);
    const srtFile = path.join(voiceDir, `frame-${index}.srt`);

    try {
      this.loggerService.log(`Started adding audio to clip ${index}`);

      // Generate words for drawtext from SRT if available
      const words = fs.existsSync(srtFile)
        ? this.filesCaptionsService.filterCaptions(
            fs.readFileSync(srtFile, 'utf8'),
          )
        : [];

      const filters: string[] = this.filesCaptionsService.getDrawtextFilters(
        fontFamily,
        words,
        dimensions,
      );

      filters.push(
        ...this.filesCaptionsService.getOverlayDrawtextFilters(
          fontFamily,
          [slideText],
          dimensions,
        ),
      );

      const mixInputs: string[] = [];
      const hasVoice = fs.existsSync(voiceFile);

      // Add voice if exists
      if (hasVoice) {
        filters.push(`[1:a]volume=1[voice]`);
        mixInputs.push(`[voice]`);
      }

      // If we have audio to mix
      if (mixInputs.length > 0) {
        filters.push(
          `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[mix]`,
        );
      }

      await this.ffmpegService.addAudioAndTextToVideo(inputPath, outputPath, {
        audioCodec: 'aac',
        audioPath: hasVoice ? voiceFile : undefined,
        filters,
        includeAudio: hasVoice,
        videoCodec: 'libx264',
      });

      this.loggerService.log(`Finished audio processing for clip ${index}`);

      // await this.websocketService.emit(websocketURL, {
      //   step: 'audio',
      //   status: 'completed',
      // });
    } catch (error: unknown) {
      this.loggerService.error(`Error adding audio to clip ${index}`, error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private async mergeProcessedClips(
    _websocketURL: string,
    ingredientId: string,
    clipPaths: string[],
    outputPath: string,
  ): Promise<void> {
    this.loggerService.log('Merging processed clips');

    // Add background music if it exists
    const musicPath = path.join(
      this.getPath('musics', ingredientId),
      'frame-0.mp3',
    );

    const hasMusic = fs.existsSync(musicPath);

    try {
      await this.ffmpegService.mergeVideosWithMusic(clipPaths, outputPath, {
        audioCodec: 'aac',
        crf: '23',
        musicPath: hasMusic ? musicPath : undefined,
        musicVolume: 0.05,
        preset: 'ultrafast',
        videoCodec: 'libx264',
      });

      this.loggerService.log('Finished clips merge');

      // await this.websocketService.emit(websocketURL, {
      //   step: 'clips',
      //   status: 'completed',
      // });
    } catch (error: unknown) {
      this.loggerService.error('Error in final merge', error);

      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async createVideoFromImages(
    _images: string[],
    config: unknown,
    ingredientId: string,
  ): Promise<string> {
    const slideText: SlideText[] = config.slideText || [];
    const fontFamily = config.fontFamily || 'montserrat-black';
    const dimensions = config.dimensions || { height: 1920, width: 1080 };
    const isWatermarkEnabled = config.isWatermarkEnabled || false;
    const _websocketURL = config.websocketURL || '';

    return this.generateImageToVideo(
      _websocketURL,
      ingredientId,
      slideText,
      fontFamily,
      dimensions,
      isWatermarkEnabled,
    );
  }
}
