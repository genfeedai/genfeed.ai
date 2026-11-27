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
import { normalizeAssetScope } from '@api/guards/asset-access.guard';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  INGREDIENT_VERSION_HISTORY_LIMIT,
  IngredientVersionRelation,
} from '@genfeedai/contracts';
import { withExternalMediaFallback } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface IngredientVersionViewer {
  /** Narrows the asked-for asset to one brand; omit it to allow any brand. */
  brandId?: string;
  organizationId: string;
  /** Ids the viewer is known by, so a `USER` asset is shown to its owner only. */
  userIds?: readonly string[];
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
  isDeleted: true,
  parentId: true,
  relationKind: true,
  scope: true,
  userId: true,
  version: true,
} as const;

/**
 * How many rows of one family are read to resolve it. It is far above what is
 * shown (`INGREDIENT_VERSION_HISTORY_LIMIT`) so the display cap never changes
 * which asset is the first one, which version is the newest or which is active.
 */
const FAMILY_SCAN_LIMIT = 500;

type FamilyRow = VersionHistoryRow & {
  isDeleted: boolean;
  scope: string | null;
  userId: string | null;
};

interface VersionFamily {
  /** The first asset's explicit choice, read even if that asset was trashed. */
  chosenId: string | null;
  /** Live entries the viewer may see, oldest first. */
  members: FamilyRow[];
  /** The first asset of the family, the one that holds the choice. */
  rootId: string;
}

/**
 * A `USER` asset is private to its owner, like `AssetAccessGuard` decides for a
 * single asset. Every other scope is already limited to the organization (and,
 * for the asked-for asset, the brand) by the query.
 */
function isVisibleTo(row: FamilyRow, viewer: IngredientVersionViewer): boolean {
  if (normalizeAssetScope(row.scope) !== AssetScope.USER) {
    return true;
  }
  return Boolean(row.userId && viewer.userIds?.includes(row.userId));
}

/**
 * Reads and sets the version history of an asset (#7397).
 *
 * A history is the first asset plus every live descendant reached through a
 * `VERSION` or `TRANSFORMATION` link. Derivatives and sources are different
 * assets and never appear in it. Trashing a version removes only that version:
 * the versions made from it stay. The first asset holds `activeVersionId`; an
 * explicit choice never deletes anything, and a history with no choice (or whose
 * choice was trashed) uses its newest entry.
 *
 * Visibility follows the Library: same organization and the viewer's active
 * brand for the asset that was asked for, and a `USER` asset only for its
 * owner. An asset the viewer cannot see is a 404, the same as one that does not
 * exist. The same rule decides which linked versions are listed: a private
 * version made by someone else is left out, and the versions made from it stay.
 * Only the newest `INGREDIENT_VERSION_HISTORY_LIMIT` entries (and the active
 * one) are listed, but the first asset, the newest and the active version are
 * resolved from the whole family.
 */
@Traced()
@Injectable()
export class IngredientVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findHistory(
    ingredientId: string,
    viewer: IngredientVersionViewer,
  ): Promise<IngredientVersionHistoryResult> {
    const family = await this.loadFamily(ingredientId, viewer);
    return this.toResult(family, viewer);
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
    const family = await this.loadFamily(ingredientId, viewer);
    const { members } = family;
    if (!members.some((row) => row.id === versionId)) {
      throw new ValidationException(
        'The version is not part of this asset history',
        'versionId',
        versionId,
      );
    }
    const isNewest = members[members.length - 1].id === versionId;
    const chosenId = isNewest ? null : versionId;
    // The first asset may itself be in Trash; its pointer is still the one read.
    await this.prisma.ingredient.updateMany({
      data: { activeVersionId: chosenId },
      where: scopedWhere(viewer.organizationId, {
        id: family.rootId,
        isDeleted: undefined,
      }),
    });
    return this.toResult({ ...family, chosenId }, viewer);
  }

  private async toResult(
    family: VersionFamily,
    viewer: IngredientVersionViewer,
  ): Promise<IngredientVersionHistoryResult> {
    const { chosenId, members, rootId } = family;
    const activeVersionId = resolveActiveVersionId(members, chosenId);
    const numbered = members.map((row, index) => ({
      number: index + 1,
      row,
    }));
    const shown =
      numbered.length > INGREDIENT_VERSION_HISTORY_LIMIT
        ? numbered.filter(
            ({ row }, index) =>
              index >= numbered.length - INGREDIENT_VERSION_HISTORY_LIMIT ||
              row.id === activeVersionId,
          )
        : numbered;
    const versions = shown.map(({ number, row }) => ({
      id: row.id,
      isActive: row.id === activeVersionId,
      number,
      relation: classifyVersionRelation(row),
    }));
    const rows = await this.prisma.ingredient.findMany({
      take: INGREDIENT_VERSION_HISTORY_LIMIT + 1,
      where: scopedWhere(viewer.organizationId, {
        id: { in: shown.map(({ row }) => row.id) },
      }),
    });
    // The rows above are already scoped to the organization, so their metadata
    // ids are too.
    const metadata = await this.prisma.metadata.findMany({
      take: INGREDIENT_VERSION_HISTORY_LIMIT + 1,
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
      docs: shown.flatMap(({ row }) => {
        const full = byId.get(row.id);
        return full
          ? [withExternalMediaFallback(full) as Record<string, unknown>]
          : [];
      }),
      isLineageAvailable:
        versions[0].relation !== IngredientVersionRelation.UNAVAILABLE,
      rootId,
      versions,
    };
  }

  /**
   * The whole family of the asked-for asset: up to its first asset, then down
   * through every version link. Trashed and private-to-someone-else rows are
   * walked through (so a version made from a trashed one is still found) and
   * then left out of the entries.
   */
  private async loadFamily(
    ingredientId: string,
    viewer: IngredientVersionViewer,
  ): Promise<VersionFamily> {
    const start: FamilyRow | null = await this.prisma.ingredient.findFirst({
      select: HISTORY_SELECT,
      where: scopedWhere(viewer.organizationId, {
        brandId: viewer.brandId ? viewer.brandId : { not: null },
        id: ingredientId,
      }),
    });
    if (!start || !isVisibleTo(start, viewer)) {
      throw new NotFoundException('Asset');
    }

    let root: FamilyRow = start;
    const seen = new Set<string>([start.id]);
    while (
      root.parentId &&
      isVersionRelation(root.relationKind) &&
      seen.size < FAMILY_SCAN_LIMIT
    ) {
      const parent: FamilyRow | null = await this.prisma.ingredient.findFirst({
        select: HISTORY_SELECT,
        where: scopedWhere(viewer.organizationId, {
          id: root.parentId,
          isDeleted: undefined,
        }),
      });
      if (!parent || seen.has(parent.id)) {
        break;
      }
      seen.add(parent.id);
      root = parent;
    }

    const family: FamilyRow[] = [root];
    const known = new Set<string>([root.id]);
    let frontier = [root.id];
    while (frontier.length > 0 && family.length < FAMILY_SCAN_LIMIT) {
      const children: FamilyRow[] = await this.prisma.ingredient.findMany({
        select: HISTORY_SELECT,
        take: FAMILY_SCAN_LIMIT,
        where: scopedWhere(viewer.organizationId, {
          isDeleted: undefined,
          parentId: { in: frontier },
          relationKind: { in: [...VERSION_RELATION_KINDS] },
        }),
      });
      frontier = [];
      for (const child of children) {
        if (known.has(child.id) || family.length >= FAMILY_SCAN_LIMIT) {
          continue;
        }
        known.add(child.id);
        family.push(child);
        frontier.push(child.id);
      }
    }
    // A family past the scan limit may not reach the asked-for asset; it is
    // always one of its own entries.
    if (!known.has(start.id)) {
      family.push(start);
    }

    return {
      chosenId: root.activeVersionId,
      members: orderVersionHistory(
        family.filter((row) => !row.isDeleted && isVisibleTo(row, viewer)),
      ),
      rootId: root.id,
    };
  }
}
