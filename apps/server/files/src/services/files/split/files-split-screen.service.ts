import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesSplitScreenService extends FilesService {
  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,

    private readonly ffmpegService: FFmpegService,
  ) {
    super(configService, loggerService, httpService);
  }

  public async generateSplitScreen(
    ingredientId: string,
    topClip: string,
    bottomClip: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const outputDir = this.getPath('output', ingredientId);
    const outputPath = path.join(outputDir, `split.mp4`);

    const topPath = path.join(this.getPath('clips', ingredientId), topClip);
    const bottomPath = path.join(
      this.getPath('clips', ingredientId),
      bottomClip,
    );

    try {
      this.loggerService.log(`Started split screen generation`);

      await this.ffmpegService.createVerticalSplitScreen(
        topPath,
        bottomPath,
        outputPath,
        dimensions,
      );

      this.loggerService.log(`Finished split screen`);
      this.loggerService.log(`✅ Video generated at: ${outputPath}`);
      return outputPath;
    } catch (error: unknown) {
      this.loggerService.error('Error generating split screen', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public createSplitScreenVideo(
    _videos: string[],
    ingredientId: string,
    options?: unknown,
  ): Promise<string> {
    const dimensions = options?.dimensions || { height: 1920, width: 1080 };
    const topClip = options?.topClip || 'clip-0.mp4';
    const bottomClip = options?.bottomClip || 'clip-1.mp4';

    return this.generateSplitScreen(
      ingredientId,
      topClip,
      bottomClip,
      dimensions,
    );
  }
}
