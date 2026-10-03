import { classifyLegacyIngredientOrigin } from '@api/collections/ingredients/utils/ingredient-origin.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientLineageDirection } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { withExternalMediaFallback } from '@libs/media/media-url.util';
import { Injectable } from '@nestjs/common';

export interface IngredientLineageViewer {
  brandId?: string;
  organizationId: string;
}

export interface IngredientLineageQuery {
  direction: IngredientLineageDirection;
  ingredientId: string;
  limit: number;
  page: number;
  viewer: IngredientLineageViewer;
}

export interface IngredientLineageResult {
  docs: Record<string, unknown>[];
  /** Related assets in the organization outside the viewer's brand access. */
  hiddenCount: number;
  limit: number;
  page: number;
  totalDocs: number;
  totalPages: number;
}

/**
 * Reads the `sources` / `sourceOf` relation of an asset: the references it was
 * made from, and the outputs that used it as a reference. It adds no version or
 * derivative semantics (#73); it only surfaces links generations already record.
 *
 * Visibility follows the Library list: same organization, and the viewer's
 * active brand. An asset outside that scope is counted in `hiddenCount` and is
 * never loaded into the response, so it cannot be named or described.
 */
@Injectable()
export class IngredientLineageService {
  constructor(private readonly prisma: PrismaService) {}

  async findLineage(
    query: IngredientLineageQuery,
  ): Promise<IngredientLineageResult> {
    const { direction, ingredientId, limit, page, viewer } = query;
    const brandId = viewer.brandId ? viewer.brandId : { not: null };

    // The asset itself may sit in Trash (the Trash place opens the inspector),
    // but it must be one the viewer could list in the Library.
    const root = await this.prisma.ingredient.findFirst({
      select: { id: true },
      where: {
        brandId,
        id: ingredientId,
        OR: [{ isDeleted: false }, { isDeleted: true }],
        organizationId: viewer.organizationId,
      },
    });

    if (!root) {
      throw new NotFoundException('Asset');
    }

    const relation: Prisma.IngredientWhereInput =
      direction === IngredientLineageDirection.MADE_FROM
        ? { sourceOf: { some: { id: ingredientId } } }
        : { sources: { some: { id: ingredientId } } };

    // A reference that was trashed stays visible as a "Deleted reference"; an
    // output that was trashed is simply no longer a place the reference is used.
    const softDelete: Prisma.IngredientWhereInput =
      direction === IngredientLineageDirection.MADE_FROM
        ? { OR: [{ isDeleted: false }, { isDeleted: true }] }
        : { isDeleted: false };

    const accessibleWhere: Prisma.IngredientWhereInput = {
      ...relation,
      ...softDelete,
      brandId,
      organizationId: viewer.organizationId,
    };
    const organizationWhere: Prisma.IngredientWhereInput = {
      ...relation,
      ...softDelete,
      organizationId: viewer.organizationId,
    };

    const [rows, totalDocs, organizationTotal] = await Promise.all([
      this.prisma.ingredient.findMany({
        include: { metadata: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where: accessibleWhere,
      }),
      this.prisma.ingredient.count({ where: accessibleWhere }),
      this.prisma.ingredient.count({ where: organizationWhere }),
    ]);

    return {
      docs: rows.map((row) => this.toLineageDocument(row)),
      hiddenCount: Math.max(0, organizationTotal - totalDocs),
      limit,
      page,
      totalDocs,
      totalPages: Math.max(1, Math.ceil(totalDocs / limit)),
    };
  }

  private toLineageDocument(row: {
    bookmarkId: string | null;
    category: string;
    createdAt: Date;
    generationPrompt: string | null;
    generationSource: string | null;
    id: string;
    isDeleted: boolean;
    modelUsed: string | null;
    status: string;
    updatedAt: Date;
  }): Record<string, unknown> {
    const origin = classifyLegacyIngredientOrigin(row);

    // A trashed reference keeps no media, name or prompt: only that it existed.
    if (row.isDeleted) {
      return {
        category: row.category,
        createdAt: row.createdAt,
        id: row.id,
        isDeleted: true,
        origin,
        updatedAt: row.updatedAt,
      };
    }

    return {
      ...(withExternalMediaFallback(row) as Record<string, unknown>),
      origin,
    };
  }
}
