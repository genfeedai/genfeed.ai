import { TrendPlaybackService } from '@files/services/trend-playback/trend-playback.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

/**
 * Deletes a saved TikTok or Instagram trend clip once its copy lapses. No new
 * copies are saved: the app plays these videos in the platform's own player.
 */
@Controller('files')
export class FilesTrendPlaybackController {
  constructor(
    private readonly logger: LoggerService,
    private readonly trendPlaybackService: TrendPlaybackService,
  ) {}

  @Post('process/trend-playback/delete')
  async removeTrendPlayback(@Body() body: { playbackKey: string }) {
    if (!body.playbackKey) {
      throw new HttpException(
        'playbackKey is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.trendPlaybackService.remove(body.playbackKey);
      return { removed: true };
    } catch (error: unknown) {
      this.logger.error('Failed to remove trend playback:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to remove trend playback',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
