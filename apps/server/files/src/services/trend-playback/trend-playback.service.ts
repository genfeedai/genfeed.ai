import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { createBadRequest } from '@libs/utils/error/create-bad-request.util';
import { Injectable } from '@nestjs/common';

const TREND_PLAYBACK_FOLDER = 'trend-playback';
const TREND_PLAYBACK_KEY_PREFIX = `assets/${TREND_PLAYBACK_FOLDER}/`;

/** Removes the TikTok and Instagram clips that were saved before playback moved to the platforms' own players. */
@Injectable()
export class TrendPlaybackService {
  constructor(
    private readonly uploadService: UploadService,
    private readonly logger: LoggerService,
  ) {}

  async remove(playbackKey: string): Promise<void> {
    if (!playbackKey.startsWith(TREND_PLAYBACK_KEY_PREFIX)) {
      throw createBadRequest('playbackKey is not a trend playback copy');
    }
    await this.uploadService.deleteStoredObject(playbackKey);
    this.logger.log(`[TrendPlayback] Removed ${playbackKey}`);
  }
}
