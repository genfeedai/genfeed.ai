import {
  classifyVersionRelation,
  isVersionRelation,
  orderVersionHistory,
  resolveActiveVersionId,
  VERSION_RELATION_KINDS,
  type VersionHistoryRow,
} from '@api/collections/ingredients/utils/ingredient-version-history.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  INGREDIENT_VERSION_HISTORY_LIMIT,
  IngredientVersionRelation,
} from '@genfeedai/contracts';
import { withExternalMediaFallback } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface IngredientVersionViewer {
  brandId?: string;
  organizationId: string;
}

interface IngredientVersionEntryResult {
  id: string;
  isActive: boolean;
  number: number;
  relation: IngredientVersionRelation;
}

export interface IngredientVersionHistoryResult {
  activeVersionId: string;
  docs: Record<string, unknown>[];
  isLineageAvailable: boolean;
  rootId: string;
  versions: IngredientVersionEntryResult[];
}

const HISTORY_SELECT = {
  activeVersionId: true,
  createdAt: true,
  id: true,
  parentId: true,
  relationKind: true,
  version: true,
} as const;

/**
 * Reads and sets the version history of an asset (#7397).
 *
 * A history is the first asset plus every live descendant reached through a
 * `VERSION` or `TRANSFORMATION` link. Derivatives and sources are different
 * assets and never appear in it. The first asset holds `activeVersionId`; an
 * explicit choice never deletes anything, and a history with no choice (or whose
 * choice was trashed) uses its newest entry.
 *
 * Visibility follows the Library: same organization and the viewer's active
 * brand for the asset that was asked for. An asset the viewer cannot list is a
 * 404, the same as one that does not exist.
 */
@Traced()
@Injectable()
export class IngredientVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findHistory(
    ingredientId: string,
    viewer: IngredientVersionViewer,
  ): Promise<IngredientVersionHistoryResult> {
    const members = await this.loadMembers(ingredientId, viewer);
    const ordered = orderVersionHistory(members);
    const activeVersionId = resolveActiveVersionId(ordered);
    const root = ordered[0];
    const versions = ordered.map((row, index) => ({
      id: row.id,
      isActive: row.id === activeVersionId,
      number: index + 1,
      relation: classifyVersionRelation(row),
    }));
    const rows = await this.prisma.ingredient.findMany({
      take: INGREDIENT_VERSION_HISTORY_LIMIT,
      where: scopedWhere(viewer.organizationId, {
        id: { in: ordered.map(({ id }) => id) },
      }),
    });
    // The rows above are already scoped to the organization, so their metadata
    // ids are too.
    const metadata = await this.prisma.metadata.findMany({
      take: INGREDIENT_VERSION_HISTORY_LIMIT,
      where: {
        id: {
          in: rows.flatMap(({ metadataId }) =>
            metadataId ? [metadataId] : [],
          ),
        },
      },
    });
    const metadataById = new Map(metadata.map((row) => [row.id, row]));
    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          metadata: row.metadataId
            ? (metadataById.get(row.metadataId) ?? null)
            : null,
        },
      ]),
    );

    return {
      activeVersionId,
      docs: ordered.flatMap((row) => {
        const full = byId.get(row.id);
        return full
          ? [withExternalMediaFallback(full) as Record<string, unknown>]
          : [];
      }),
      isLineageAvailable:
        versions[0].relation !== IngredientVersionRelation.UNAVAILABLE,
      rootId: root.id,
      versions,
    };
  }

  /**
   * Makes a version of the history the active one. Nothing is deleted or
   * rewritten: only the first asset's pointer moves. Choosing the newest entry
   * clears the pointer, so a version saved later becomes active on its own.
   */
  async setActive(
    ingredientId: string,
    versionId: string,
    viewer: IngredientVersionViewer,
  ): Promise<IngredientVersionHistoryResult> {
    const members = await this.loadMembers(ingredientId, viewer);
    const ordered = orderVersionHistory(members);
    if (!ordered.some((row) => row.id === versionId)) {
      throw new ValidationException(
        'The version is not part of this asset history',
        'versionId',
        versionId,
      );
    }
    const isNewest = ordered[ordered.length - 1].id === versionId;
    await this.prisma.ingredient.updateMany({
      data: { activeVersionId: isNewest ? null : versionId },
      where: scopedWhere(viewer.organizationId, { id: ordered[0].id }),
    });
    return this.findHistory(ingredientId, viewer);
  }

  private async loadMembers(
    ingredientId: string,
    viewer: IngredientVersionViewer,
  ): Promise<VersionHistoryRow[]> {
    const start = await this.prisma.ingredient.findFirst({
      select: HISTORY_SELECT,
      where: scopedWhere(viewer.organizationId, {
        brandId: viewer.brandId ? viewer.brandId : { not: null },
        id: ingredientId,
      }),
    });
    if (!start) {
      throw new NotFoundException('Asset');
    }

    let root: VersionHistoryRow = start;
    const seen = new Set<string>([start.id]);
    while (
      root.parentId &&
      isVersionRelation(root.relationKind) &&
      seen.size < INGREDIENT_VERSION_HISTORY_LIMIT
    ) {
      const parent: VersionHistoryRow | null =
        await this.prisma.ingredient.findFirst({
          select: HISTORY_SELECT,
          where: scopedWhere(viewer.organizationId, { id: root.parentId }),
        });
      if (!parent || seen.has(parent.id)) {
        break;
      }
      seen.add(parent.id);
      root = parent;
    }

    const members: VersionHistoryRow[] = [root];
    const known = new Set<string>([root.id]);
    let frontier = [root.id];
    while (
      frontier.length > 0 &&
      members.length < INGREDIENT_VERSION_HISTORY_LIMIT
    ) {
      const children: VersionHistoryRow[] =
        await this.prisma.ingredient.findMany({
          select: HISTORY_SELECT,
          take: INGREDIENT_VERSION_HISTORY_LIMIT,
          where: scopedWhere(viewer.organizationId, {
            parentId: { in: frontier },
            relationKind: { in: [...VERSION_RELATION_KINDS] },
          }),
        });
      frontier = [];
      for (const child of children) {
        if (
          known.has(child.id) ||
          members.length >= INGREDIENT_VERSION_HISTORY_LIMIT
        ) {
          continue;
        }
        known.add(child.id);
        members.push(child);
        frontier.push(child.id);
      }
    }
    return members;
  }
}
