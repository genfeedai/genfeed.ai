import type {
  TrendPlaybackRequest,
  TrendPlaybackResult,
} from '@files/services/trend-playback/trend-playback.interfaces';
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
 * Saves a TikTok or Instagram trend clip for Genfeed's own player and deletes
 * the copy once it lapses. The API decides who may play and when a copy ends.
 */
@Controller('files')
export class FilesTrendPlaybackController {
  constructor(
    private readonly logger: LoggerService,
    private readonly trendPlaybackService: TrendPlaybackService,
  ) {}

  @Post('process/trend-playback')
  async prepareTrendPlayback(
    @Body() body: TrendPlaybackRequest,
  ): Promise<TrendPlaybackResult> {
    try {
      if (!body.sourceUrl || !body.videoId) {
        throw new HttpException(
          'sourceUrl and videoId are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.trendPlaybackService.prepare(body);
    } catch (error: unknown) {
      this.logger.error('Failed to prepare trend playback:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to prepare trend playback',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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
