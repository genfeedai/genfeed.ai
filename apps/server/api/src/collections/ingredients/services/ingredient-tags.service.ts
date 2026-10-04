import {
  canEditAssetTags,
  type TagEditor,
} from '@api/collections/ingredients/utils/ingredient-tag-edit-access.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TagBulkAction } from '@genfeedai/contracts';
import type { IBulkTagResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BulkSetTagParams {
  action: TagBulkAction;
  editor: TagEditor;
  ids: string[];
  organizationId: string;
  tagId: string;
}

/** Library tagging (#6011): one tag on many assets, brand safe and reported. */
@Injectable()
export class IngredientTagsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Add or remove one tag on many assets.
   *
   * Assets the member cannot edit, assets that are missing or in the trash, and
   * assets the tag cannot be attached to (a brand tag only attaches to assets of
   * that brand) are skipped, never an error for the whole request. Assets that
   * already match the request are skipped too. A failed write is reported, not
   * thrown, so one bad batch never hides what did change.
   */
  async bulkSetTag(params: BulkSetTagParams): Promise<IBulkTagResult> {
    const { action, editor, organizationId, tagId } = params;
    const ids = [...new Set(params.ids)];

    const tag = await this.prisma.tag.findFirst({
      select: { brandId: true, id: true },
      where: {
        id: tagId,
        isDeleted: false,
        OR: [{ organizationId }, { organizationId: null, userId: null }],
      },
    });
    if (!tag) {
      throw new NotFoundException('Tag', tagId);
    }

    const assets = await this.prisma.ingredient.findMany({
      select: { brandId: true, id: true, scope: true, userId: true },
      where: scopedWhere(organizationId, { id: { in: ids } }),
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));

    const eligibleIds: string[] = [];
    const skippedIds: string[] = [];
    for (const id of ids) {
      const asset = assetById.get(id);
      const isAttachable =
        action === TagBulkAction.REMOVE ||
        !tag.brandId ||
        tag.brandId === asset?.brandId;
      if (asset && isAttachable && canEditAssetTags(asset, editor)) {
        eligibleIds.push(id);
      } else {
        skippedIds.push(id);
      }
    }

    const alreadyTagged = new Set(
      eligibleIds.length === 0
        ? []
        : (
            await this.prisma.ingredient.findMany({
              select: { id: true },
              where: scopedWhere(organizationId, {
                id: { in: eligibleIds },
                tags: { some: { id: tagId } },
              }),
            })
          ).map((row) => row.id),
    );

    const changeIds: string[] = [];
    for (const id of eligibleIds) {
      const isTagged = alreadyTagged.has(id);
      if (isTagged === (action === TagBulkAction.REMOVE)) {
        changeIds.push(id);
      } else {
        skippedIds.push(id);
      }
    }

    const failedIds: string[] = [];
    if (changeIds.length > 0) {
      const relation = changeIds.map((id) => ({ id }));
      try {
        await this.prisma.tag.update({
          data: {
            ingredients:
              action === TagBulkAction.ADD
                ? { connect: relation }
                : { disconnect: relation },
          },
          where: {
            id: tagId,
            isDeleted: false,
            OR: [{ organizationId }, { organizationId: null, userId: null }],
          },
        });
      } catch (error: unknown) {
        failedIds.push(...changeIds);
        this.logger.error(`${this.constructorName} bulkSetTag failed`, {
          action,
          error,
          organizationId,
          requested: ids.length,
          tagId,
        });
      }
    }

    const changed = failedIds.length > 0 ? 0 : changeIds.length;

    this.logger.debug(`${this.constructorName} bulkSetTag success`, {
      action,
      changed,
      failed: failedIds.length,
      requested: ids.length,
      skipped: skippedIds.length,
    });

    return {
      changed,
      failed: failedIds.length,
      failedIds,
      skipped: skippedIds.length,
      skippedIds,
    };
  }
}
