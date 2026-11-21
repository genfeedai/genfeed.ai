import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  IngredientCategory,
  IngredientStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { videoRetentionDays } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Traced } from '@libs/tracing/traced';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
const ORGANIZATION_PAGE_SIZE = 200;
const DELETE_CONCURRENCY = 5;
const MAX_DELETES_PER_RUN = 5_000;
const VIDEO_KEY_PREFIX = 'ingredients/videos/';

const VIDEO_CATEGORIES = [
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
];

/** Statuses whose file exists. Failed and draft videos never had one. */
const STORED_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
  IngredientStatus.ARCHIVED,
];

/**
 * A post in any of these states needs the file: it is queued, running, live, or
 * failed and can be retried. A draft, cancelled or skipped post does not.
 */
const KEEPING_POST_STATES = [
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
];

export type VideoRetentionTotals = {
  deleted: number;
  failed: number;
  organizations: number;
  skippedOrganizations: number;
};

type VideoRow = { id: string; s3Key: string | null };

/**
 * Deletes the stored file of generated videos that were never posted once they
 * pass their retention window: 7 days for pay-as-you-go organizations, 30 for
 * subscribers (`videoRetentionDays`). The ingredient row stays, stamped with
 * `storageExpiredAt`, so the Library can say the file expired instead of
 * showing a broken player.
 *
 * A video attached to a post that is scheduled, publishing, published or
 * failed is never touched, and neither is one the files service cannot name a
 * `ingredients/videos/` key for. The window is read from the organization's
 * subscription at sweep time, so an upgrade extends it and a downgrade shortens
 * it. An organization whose subscription cannot be read is skipped, never
 * treated as pay-as-you-go. Deployments without organization billing keep
 * every file.
 */
@Traced()
@Injectable()
export class VideoRetentionService {
  private readonly context = 'VideoRetentionService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesClientService,
    private readonly paidAccess: OrganizationPaidAccessService,
    private readonly logger: LoggerService,
  ) {}

  /** Deletes up to one run's worth of expired, never-posted video files. */
  async sweep(now = new Date()): Promise<VideoRetentionTotals> {
    const totals: VideoRetentionTotals = {
      deleted: 0,
      failed: 0,
      organizations: 0,
      skippedOrganizations: 0,
    };
    if (!hasOrganizationBilling()) return totals;

    let afterOrganizationId: string | null = null;
    while (totals.deleted + totals.failed < MAX_DELETES_PER_RUN) {
      const organizationIds = await this.listOrganizationIds(
        now,
        afterOrganizationId,
      );
      if (organizationIds.length === 0) break;
      afterOrganizationId = organizationIds[organizationIds.length - 1] ?? null;

      for (const organizationId of organizationIds) {
        if (totals.deleted + totals.failed >= MAX_DELETES_PER_RUN) break;
        totals.organizations += 1;

        let isSubscriber: boolean;
        try {
          isSubscriber =
            await this.paidAccess.hasPaidSubscriptionStrict(organizationId);
        } catch (error: unknown) {
          totals.skippedOrganizations += 1;
          this.logger.warn('Video retention skipped an organization', {
            context: this.context,
            error: getErrorMessage(error),
            organizationId,
          });
          continue;
        }

        await this.sweepOrganization(organizationId, isSubscriber, now, totals);
      }
    }

    if (totals.deleted + totals.failed + totals.skippedOrganizations > 0) {
      this.logger.log('Video retention sweep finished', {
        context: this.context,
        ...totals,
      });
    }
    return totals;
  }

  static cutoff(now: Date, isSubscriber: boolean): Date {
    return new Date(
      now.getTime() - videoRetentionDays(isSubscriber) * MS_PER_DAY,
    );
  }

  /** Never-posted stored videos older than `cutoff`; organization added by the caller. */
  private expiredWhere(cutoff: Date) {
    return {
      category: { in: VIDEO_CATEGORIES },
      createdAt: { lt: cutoff },
      postEntities: {
        none: {
          isDeleted: false,
          targetExecutionState: { in: KEEPING_POST_STATES },
        },
      },
      postLinks: {
        none: {
          post: {
            isDeleted: false,
            targetExecutionState: { in: KEEPING_POST_STATES },
          },
        },
      },
      postedTo: { isEmpty: true },
      status: { in: STORED_STATUSES },
      storageExpiredAt: null,
    };
  }

  /** One page of organizations with an expired video, resumable from `afterId`. */
  private async listOrganizationIds(
    now: Date,
    afterId: string | null,
  ): Promise<string[]> {
    // Every organization is eligible after the shortest window; each one's own
    // window is applied in `sweepOrganization`.
    const shortest = VideoRetentionService.cutoff(now, false);
    // tenant-scope-ignore: platform retention sweep enumerating organizations; every later read is scoped by organizationId.
    const rows = await this.prisma.ingredient.findMany({
      distinct: ['organizationId'],
      orderBy: { organizationId: 'asc' },
      select: { organizationId: true },
      take: ORGANIZATION_PAGE_SIZE,
      where: {
        ...this.expiredWhere(shortest),
        isDeleted: false,
        organizationId: afterId ? { gt: afterId } : { not: null },
      },
    });
    return rows.flatMap((row) =>
      row.organizationId ? [row.organizationId] : [],
    );
  }

  private async sweepOrganization(
    organizationId: string,
    isSubscriber: boolean,
    now: Date,
    totals: VideoRetentionTotals,
  ): Promise<void> {
    const cutoff = VideoRetentionService.cutoff(now, isSubscriber);
    let afterId: string | null = null;

    while (totals.deleted + totals.failed < MAX_DELETES_PER_RUN) {
      const rows: VideoRow[] = await this.prisma.ingredient.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, s3Key: true },
        take: BATCH_SIZE,
        where: scopedWhere(organizationId, {
          ...this.expiredWhere(cutoff),
          ...(afterId ? { id: { gt: afterId } } : {}),
        }),
      });
      if (rows.length === 0) return;
      afterId = rows[rows.length - 1]?.id ?? null;

      const stillExpired = await this.recheck(organizationId, rows, cutoff);
      for (let i = 0; i < stillExpired.length; i += DELETE_CONCURRENCY) {
        const chunk = stillExpired.slice(i, i + DELETE_CONCURRENCY);
        const results = await Promise.all(
          chunk.map((row) => this.expire(organizationId, row, now)),
        );
        for (const isDeleted of results) {
          if (isDeleted) totals.deleted += 1;
          else totals.failed += 1;
        }
      }
    }
  }

  /** Narrows the window between listing a batch and deleting from it. */
  private async recheck(
    organizationId: string,
    rows: VideoRow[],
    cutoff: Date,
  ): Promise<VideoRow[]> {
    const ids = rows.map((row) => row.id);
    const rowsStillExpired = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        ...this.expiredWhere(cutoff),
        id: { in: ids },
      }),
    });
    const keep = new Set(rowsStillExpired.map((row) => row.id));
    return rows.filter((row) => keep.has(row.id));
  }

  /** Deletes the file, then stamps the row. Returns false when either step failed. */
  private async expire(
    organizationId: string,
    row: VideoRow,
    now: Date,
  ): Promise<boolean> {
    const storageKey = VideoRetentionService.storageKey(row);
    try {
      await this.files.deleteStoredObject(storageKey);
      await this.prisma.ingredient.updateMany({
        data: { storageExpiredAt: now },
        where: scopedWhere(organizationId, {
          id: row.id,
          storageExpiredAt: null,
        }),
      });
      return true;
    } catch (error: unknown) {
      this.logger.error('Video retention failed to delete a file', {
        context: this.context,
        error: getErrorMessage(error),
        ingredientId: row.id,
        organizationId,
      });
      Sentry.captureException(error, {
        tags: { area: 'video-retention', ingredientId: row.id },
      });
      return false;
    }
  }

  /**
   * The object this video owns: its saved key when that is a video key, else
   * the canonical key derived from its id (legacy rows lost the key).
   */
  static storageKey(row: VideoRow): string {
    const saved = row.s3Key?.trim();
    return saved?.startsWith(VIDEO_KEY_PREFIX)
      ? saved
      : `${VIDEO_KEY_PREFIX}${row.id}`;
  }
}
