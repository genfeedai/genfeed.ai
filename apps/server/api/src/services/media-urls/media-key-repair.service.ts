import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MEDIA_RECOVERY_BATCH_SIZE } from '@api/services/media-urls/media-recovery.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

const REPAIRABLE_CATEGORIES = [
  IngredientCategory.IMAGE,
  IngredientCategory.IMAGE_EDIT,
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
];

const FINAL_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
];

export type MediaKeyRepairCandidate = {
  category: string;
  id: string;
  organizationId: string | null;
  s3Key: string | null;
};

export type MediaKeyRepairOutcome =
  | { kind: 'repaired'; storageKey: string }
  | { kind: 'object-missing'; storageKey: string }
  | { kind: 'unsupported' };

export type MediaKeyRepairTotals = {
  failed: number;
  lastId: string | null;
  missing: number;
  repaired: number;
};

/**
 * Restores `s3Key` on IMAGE/VIDEO ingredients that lost it.
 *
 * Legacy uploads stored objects at `ingredients/<images|videos>/<id>` and a
 * missing or URL-shaped `s3Key` makes every protected preview UNSUPPORTED. The
 * canonical key is derived from the id, and it is written only after the files
 * service confirms the object exists, so a key is never invented.
 */
@Injectable()
export class MediaKeyRepairService {
  private readonly context = 'MediaKeyRepairService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesClientService,
    private readonly logger: LoggerService,
  ) {}

  static canonicalKey(
    candidate: Pick<MediaKeyRepairCandidate, 'category' | 'id'>,
  ): string | null {
    switch (candidate.category) {
      case IngredientCategory.IMAGE:
      case IngredientCategory.IMAGE_EDIT:
        return `ingredients/images/${candidate.id}`;
      case IngredientCategory.VIDEO:
      case IngredientCategory.VIDEO_EDIT:
        return `ingredients/videos/${candidate.id}`;
      default:
        return null;
    }
  }

  /** True when the stored key is absent or a URL instead of an object key. */
  static isBrokenKey(s3Key: string | null): boolean {
    return !s3Key || /^https?:\/\//i.test(s3Key);
  }

  /** Verifies the canonical object exists; persists only when `isApply`. */
  async repair(
    candidate: MediaKeyRepairCandidate,
    isApply = true,
  ): Promise<MediaKeyRepairOutcome> {
    const storageKey = MediaKeyRepairService.canonicalKey(candidate);
    if (
      !storageKey ||
      !candidate.organizationId ||
      !MediaKeyRepairService.isBrokenKey(candidate.s3Key)
    ) {
      return { kind: 'unsupported' };
    }
    if (!(await this.files.storedObjectExists(storageKey))) {
      return { kind: 'object-missing', storageKey };
    }
    if (isApply) await this.persist(candidate, storageKey);
    return { kind: 'repaired', storageKey };
  }

  /** One bounded pass, resumable from `afterId` so unrepairable rows do not starve the rest. */
  async repairBatch(
    afterId: string | null = null,
  ): Promise<MediaKeyRepairTotals> {
    const totals: MediaKeyRepairTotals = {
      failed: 0,
      lastId: null,
      missing: 0,
      repaired: 0,
    };
    // tenant-scope-ignore: platform repair sweep across organizations
    const rows = await this.prisma.ingredient.findMany({
      orderBy: { id: 'asc' },
      select: { category: true, id: true, organizationId: true, s3Key: true },
      take: MEDIA_RECOVERY_BATCH_SIZE,
      where: {
        category: { in: REPAIRABLE_CATEGORIES },
        id: afterId ? { gt: afterId } : undefined,
        isDeleted: false,
        OR: [{ s3Key: null }, { s3Key: { startsWith: 'http' } }],
        organizationId: { not: null },
        status: { in: FINAL_STATUSES },
      },
    });
    for (const row of rows) {
      totals.lastId = row.id;
      await this.repairOne(row, totals);
    }
    return totals;
  }

  private async repairOne(
    row: MediaKeyRepairCandidate,
    totals: MediaKeyRepairTotals,
  ): Promise<void> {
    try {
      const outcome = await this.repair(row);
      if (outcome.kind === 'repaired') totals.repaired += 1;
      if (outcome.kind === 'object-missing') totals.missing += 1;
    } catch (error: unknown) {
      totals.failed += 1;
      this.logger.error('Media key repair failed', {
        context: this.context,
        error: getErrorMessage(error),
        ingredientId: row.id,
      });
      Sentry.captureException(error, {
        tags: { area: 'media-key-repair', ingredientId: row.id },
      });
    }
  }

  /** Guarded write: only touches a row that is still broken and tenant-owned. */
  private async persist(
    candidate: MediaKeyRepairCandidate,
    storageKey: string,
  ): Promise<void> {
    await this.prisma.ingredient.updateMany({
      data: { s3Key: storageKey },
      where: {
        id: candidate.id,
        isDeleted: false,
        OR: [{ s3Key: null }, { s3Key: { startsWith: 'http' } }],
        organizationId: candidate.organizationId,
      },
    });
  }
}
