import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesService } from '@files/services/files/files.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FilesGifService extends FilesService {
  constructor(
    public readonly configService: ConfigService,
    public readonly loggerService: LoggerService,
    public readonly httpService: HttpService,
    private readonly ffmpegService: FFmpegService,
  ) {
    super(configService, loggerService, httpService);
  }

  public async videoToGif(videoId: string): Promise<string> {
    const outputDir = this.getPath('gifs', videoId);
    const outputPath = path.join(outputDir, `${videoId}.gif`);
    const inputPath = path.join(this.getPath('videos', videoId), 'frame-0.mp4');

    try {
      this.loggerService.log(`Started gif conversion`);

      await this.ffmpegService.videoToGif(inputPath, outputPath, {
        fps: 10,
        width: 320,
      });

      this.loggerService.log('Finished gif conversion');
      this.loggerService.log(`✅ Gif generated at: ${outputPath}`);
      return outputPath;
    } catch (error: unknown) {
      this.loggerService.error('Error generating gif', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async createGif(
    videoUrl: string,
    outputPath: string,
    options?: { width?: number; fps?: number },
  ): Promise<string> {
    try {
      this.loggerService.log(`Started gif creation from ${videoUrl}`);

      await this.ffmpegService.videoToGif(videoUrl, outputPath, {
        fps: options?.fps || 10,
        width: options?.width || 320,
      });

      this.loggerService.log('Finished gif conversion');
      this.loggerService.log(`✅ Gif generated at: ${outputPath}`);
      return outputPath;
    } catch (error: unknown) {
      this.loggerService.error('Error creating gif', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
