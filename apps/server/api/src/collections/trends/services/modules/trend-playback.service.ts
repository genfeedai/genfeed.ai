import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  FILES_REQUEST_TIMEOUT_MS,
  FilesRetryPolicy,
  sendFilesRequest,
} from '@api/services/files-microservice/client/files-request-retry.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ITrendVideoPlayback } from '@genfeedai/contracts/interfaces';
import { filesServiceAuthHeaders } from '@libs/auth/files-service-key';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

/** A saved copy lives this long after the video was last scraped or played. */
export const TREND_PLAYBACK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const PLAYBACK_PLATFORMS: ReadonlySet<string> = new Set([
  'instagram',
  'tiktok',
]);
const PLAYBACK_HOSTS = ['tiktok.com', 'instagram.com'];
const SWEEP_BATCH_SIZE = 100;

export interface TrendPlaybackFields {
  playbackExpiresAtMs: number;
  playbackKey: string;
  playbackUrl: string;
}

interface FilesPlaybackResponse {
  playbackKey: string;
  playbackUrl: string;
}

/** The saved-copy fields of a stored video, or null when it has no live copy. */
export function readPlaybackFields(data: unknown): TrendPlaybackFields | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { playbackExpiresAtMs, playbackKey, playbackUrl } = data as Record<
    string,
    unknown
  >;
  if (
    typeof playbackUrl !== 'string' ||
    typeof playbackKey !== 'string' ||
    typeof playbackExpiresAtMs !== 'number'
  ) {
    return null;
  }
  return { playbackExpiresAtMs, playbackKey, playbackUrl };
}

function isPlaybackSource(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      PLAYBACK_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
      )
    );
  } catch {
    return false;
  }
}

/**
 * Plays TikTok and Instagram trend videos in Genfeed's own player. The clip is
 * saved on first play by a paid organization, never at scrape time, and the
 * copy is kept for seven days from the last scrape or play.
 */
@Traced()
@Injectable()
export class TrendPlaybackService {
  private readonly filesServiceUrl: string;
  private readonly inFlight = new Map<string, Promise<ITrendVideoPlayback>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paidAccess: OrganizationPaidAccessService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';
  }

  async getPlayback(
    videoId: string,
    user: AuthenticatedUser,
  ): Promise<ITrendVideoPlayback> {
    const row = await this.prisma.trendingVideo.findFirst({
      select: { data: true, id: true },
      where: { id: videoId, isDeleted: false },
    });
    if (!row) {
      throw new NotFoundException('Trend video', videoId);
    }

    const data = row.data as unknown as TrendingVideoDocument;
    if (
      typeof data.platform !== 'string' ||
      !PLAYBACK_PLATFORMS.has(data.platform) ||
      !isPlaybackSource(data.videoUrl)
    ) {
      throw new UnprocessableEntityException(
        'This video can only be played on its platform',
      );
    }

    await this.assertPaid(user);

    const existing = readPlaybackFields(data);
    if (existing && existing.playbackExpiresAtMs > Date.now()) {
      return this.extendCopy(row.id, existing);
    }

    const running = this.inFlight.get(row.id);
    if (running) {
      return running;
    }
    const started = this.saveCopy(row.id, data.videoUrl).finally(() => {
      this.inFlight.delete(row.id);
    });
    this.inFlight.set(row.id, started);
    return started;
  }

  /**
   * Deletes every saved copy that has run out, then strips its fields from the
   * stored video. Returns how many copies were removed.
   */
  async removeExpiredCopies(): Promise<number> {
    // sql-risk-audit: ignore raw-sql-review -- Daily expiry cron only, LIMIT-bounded batch over the global trending_videos catalog (no tenant data); the playback keys live in the JSON `data` blob, so there is no column to index.
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; playbackKey: string }>
    >`SELECT "id", "data"->>'playbackKey' AS "playbackKey"
      FROM "trending_videos"
      WHERE "data"->>'playbackKey' IS NOT NULL
        AND COALESCE(("data"->>'playbackExpiresAtMs')::bigint, 0)
          < ${Date.now()}::bigint
      LIMIT ${SWEEP_BATCH_SIZE}`;

    let removed = 0;
    for (const row of rows) {
      try {
        await sendFilesRequest(
          () =>
            this.httpService.post(
              `${this.filesServiceUrl}/v1/files/process/trend-playback/delete`,
              { playbackKey: row.playbackKey },
              {
                headers: this.authHeaders(),
                timeout: FILES_REQUEST_TIMEOUT_MS.QUICK,
              },
            ),
          {
            logger: this.logger,
            operation: 'removeTrendPlayback',
            retryPolicy: FilesRetryPolicy.IDEMPOTENT,
          },
        );
        // sql-risk-audit: ignore raw-sql-review -- Primary-key update of one global trending_videos row; no tenant data.
        await this.prisma.$executeRaw`UPDATE "trending_videos"
          SET "data" = "data" - 'playbackKey' - 'playbackUrl' - 'playbackExpiresAtMs',
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${row.id}`;
        removed += 1;
      } catch (error: unknown) {
        this.logger.warn('Trend playback copy could not be removed', {
          error: error instanceof Error ? error.message : String(error),
          videoId: row.id,
        });
      }
    }
    return removed;
  }

  private async assertPaid(user: AuthenticatedUser): Promise<void> {
    if (getIsSuperAdmin(user)) {
      return;
    }
    if (
      !user.organizationId ||
      (await this.paidAccess.isSubscriptionGated(user.organizationId))
    ) {
      throw new ForbiddenException(
        'Playing TikTok and Instagram videos in Genfeed is on paid plans',
      );
    }
  }

  private async saveCopy(
    videoId: string,
    sourceUrl: string,
  ): Promise<ITrendVideoPlayback> {
    let saved: FilesPlaybackResponse;
    try {
      const response = await sendFilesRequest<FilesPlaybackResponse>(
        () =>
          this.httpService.post(
            `${this.filesServiceUrl}/v1/files/process/trend-playback`,
            { sourceUrl, videoId },
            {
              headers: this.authHeaders(),
              timeout: FILES_REQUEST_TIMEOUT_MS.HEAVY_PROCESSING,
            },
          ),
        { logger: this.logger, operation: 'prepareTrendPlayback' },
      );
      saved = response.data;
    } catch (error: unknown) {
      this.logger.warn('Trend video could not be saved for playback', {
        error: error instanceof Error ? error.message : String(error),
        videoId,
      });
      throw new UnprocessableEntityException(
        'This video cannot be played here',
      );
    }

    const playbackExpiresAtMs = Date.now() + TREND_PLAYBACK_RETENTION_MS;
    await this.writeFields(videoId, {
      playbackExpiresAtMs,
      playbackKey: saved.playbackKey,
      playbackUrl: saved.playbackUrl,
    });
    return {
      playbackExpiresAt: new Date(playbackExpiresAtMs).toISOString(),
      playbackUrl: saved.playbackUrl,
    };
  }

  private async extendCopy(
    videoId: string,
    existing: TrendPlaybackFields,
  ): Promise<ITrendVideoPlayback> {
    const playbackExpiresAtMs = Date.now() + TREND_PLAYBACK_RETENTION_MS;
    await this.writeFields(videoId, { ...existing, playbackExpiresAtMs });
    return {
      playbackExpiresAt: new Date(playbackExpiresAtMs).toISOString(),
      playbackUrl: existing.playbackUrl,
    };
  }

  private async writeFields(
    videoId: string,
    fields: TrendPlaybackFields,
  ): Promise<void> {
    // sql-risk-audit: ignore raw-sql-review -- Primary-key update of one global trending_videos row; no tenant data.
    await this.prisma.$executeRaw`UPDATE "trending_videos"
      SET "data" = "data" || ${JSON.stringify(fields)}::jsonb,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${videoId}`;
  }

  private authHeaders(): Record<string, string> {
    return filesServiceAuthHeaders((key) => this.configService.get(key));
  }
}
