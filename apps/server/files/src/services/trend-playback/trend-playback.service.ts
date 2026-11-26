import * as fs from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import type {
  TrendPlaybackRequest,
  TrendPlaybackResult,
} from '@files/services/trend-playback/trend-playback.interfaces';
import { UploadService } from '@files/services/upload/upload.service';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeSegment, resolveContainedPath } from '@libs/security';
import { createBadRequest } from '@libs/utils/error/create-bad-request.util';
import { Injectable } from '@nestjs/common';

export const TREND_PLAYBACK_FOLDER = 'trend-playback';
export const TREND_PLAYBACK_KEY_PREFIX = `assets/${TREND_PLAYBACK_FOLDER}/`;

/** Social shorts run under three minutes; anything longer is not a card clip. */
const MAX_DURATION_SECONDS = 180;
const MAX_FILE_SIZE_MB = 80;
const PLAYBACK_HOSTS = ['tiktok.com', 'instagram.com'];

function isPlaybackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PLAYBACK_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

/**
 * Saves one TikTok or Instagram clip so the app can play it in its own player
 * instead of the platform's embed. Runs on first play, never at scrape time.
 */
@Injectable()
export class TrendPlaybackService {
  constructor(
    private readonly ytDlpService: YtDlpService,
    private readonly uploadService: UploadService,
    private readonly logger: LoggerService,
  ) {}

  async prepare(request: TrendPlaybackRequest): Promise<TrendPlaybackResult> {
    const videoId = assertSafeSegment(
      request.videoId,
      'videoId',
      createBadRequest,
    );
    const sourceUrl = this.parseSourceUrl(request.sourceUrl);
    const fileName = `${videoId}-${Date.now()}.mp4`;
    const tmpPath = resolveContainedPath(
      path.join(FILES_TMP_ROOT, TREND_PLAYBACK_FOLDER),
      fileName,
      createBadRequest,
    );

    try {
      await this.ytDlpService.downloadShortVideo(
        sourceUrl.toString(),
        tmpPath,
        {
          maxDurationSeconds: MAX_DURATION_SECONDS,
          maxFileSizeMb: MAX_FILE_SIZE_MB,
        },
      );
      const stored = await this.uploadService.uploadPublicFile(
        TREND_PLAYBACK_FOLDER,
        fileName,
        tmpPath,
        'video/mp4',
      );
      return {
        playbackKey: stored.s3Key,
        playbackUrl: stored.publicUrl,
        size: stored.size,
      };
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  }

  async remove(playbackKey: string): Promise<void> {
    if (!playbackKey.startsWith(TREND_PLAYBACK_KEY_PREFIX)) {
      throw createBadRequest('playbackKey is not a trend playback copy');
    }
    await this.uploadService.deleteStoredObject(playbackKey);
    this.logger.log(`[TrendPlayback] Removed ${playbackKey}`);
  }

  private parseSourceUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw createBadRequest('sourceUrl must be a valid URL');
    }
    if (url.protocol !== 'https:' || !isPlaybackHost(url.hostname)) {
      throw createBadRequest('sourceUrl must be a TikTok or Instagram page');
    }
    return url;
  }
}
