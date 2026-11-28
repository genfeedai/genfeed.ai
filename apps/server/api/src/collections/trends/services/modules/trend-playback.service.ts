import {
  FILES_REQUEST_TIMEOUT_MS,
  FilesRetryPolicy,
  sendFilesRequest,
} from '@api/services/files-microservice/client/files-request-retry.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { filesServiceAuthHeaders } from '@libs/auth/files-service-key';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

const SWEEP_BATCH_SIZE = 100;

export interface TrendPlaybackFields {
  playbackExpiresAtMs: number;
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

/**
 * TikTok and Instagram trend videos play in the platform's own player, and no
 * new copy is saved. This removes the copies saved before that: each runs out
 * at the time stored with it and is deleted by the daily sweep.
 */
@Traced()
@Injectable()
export class TrendPlaybackService {
  private readonly filesServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';
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

  private authHeaders(): Record<string, string> {
    return filesServiceAuthHeaders((key) => this.configService.get(key));
  }
}
