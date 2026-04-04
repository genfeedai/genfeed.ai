import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesPortraitBlurService extends FilesService {
  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,

    private readonly ffmpegService: FFmpegService,
  ) {
    super(configService, loggerService, httpService);
  }

  public async landscapeToPortrait(
    inputType: string,
    ingredientId: string,
    videoFile: string,
    dimensions: { width: number; height: number } = {
      height: 1920,
      width: 1080,
    },
  ): Promise<string> {
    const outputDir = this.getPath('portraits', ingredientId);
    const outputPath = path.join(outputDir, 'portrait-blur.mp4');
    const inputPath = path.join(
      this.getPath(inputType, ingredientId),
      videoFile,
    );

    try {
      this.loggerService.log(`Started portrait blur conversion`);

      await this.ffmpegService.createPortraitWithBlur(
        inputPath,
        outputPath,
        dimensions,
      );

      this.loggerService.log('Finished portrait blur');
      this.loggerService.log(`✅ Video generated at: ${outputPath}`);
      return outputPath;
    } catch (error: unknown) {
      this.loggerService.error('Error generating portrait blur', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async applyPortraitBlur(
    _videoUrl: string,
    ingredientId: string,
    options?: unknown,
  ): Promise<string> {
    const inputType = options?.inputType || 'videos';
    const videoFile = options?.videoFile || 'input.mp4';
    const dimensions = options?.dimensions || { height: 1920, width: 1080 };

    return this.landscapeToPortrait(
      inputType,
      ingredientId,
      videoFile,
      dimensions,
    );
  }
}
