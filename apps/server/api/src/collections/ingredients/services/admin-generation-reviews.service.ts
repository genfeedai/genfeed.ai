import type { AdminGenerationReviewsQueryDto } from '@api/collections/ingredients/dto/admin-generation-reviews-query.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  buildAdminGenerationReviewsWhere,
  readActivityCredits,
} from '@api/collections/ingredients/utils/admin-generation-reviews.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityEntityModel } from '@genfeedai/contracts';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

/**
 * Superadmin cross-tenant generation ledger. Library `findAll` stays
 * organization-scoped; this is the one path operators use to inspect another
 * tenant's original, enhanced and compiled prompts next to the result (#5763).
 */
@Injectable()
export class AdminGenerationReviewsService {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: AdminGenerationReviewsQueryDto) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const data = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: superadmin generation ledger (#5763) is a read-only cross-tenant view; Library findAll stays organization-scoped
        await this.ingredientsService.findAll(
          {
            include: {
              brand: true,
              metadata: true,
              organization: true,
              prompt: true,
              user: true,
            },
            orderBy: handleQuerySort(query.sort),
            where: buildAdminGenerationReviewsWhere(query),
          },
          options,
        ),
    );

    const credits = await this.readCredits(data.docs.map((doc) => doc.id));
    return {
      ...data,
      docs: data.docs.map((doc) => ({
        ...doc,
        generationCredits: credits.get(doc.id) ?? null,
      })),
    };
  }

  private async readCredits(ids: string[]): Promise<Map<string, number>> {
    const credits = new Map<string, number>();
    if (ids.length === 0) return credits;

    const activities = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: reads the cost of the ledger page's own ingredient ids across organizations
        await this.prisma.activity.findMany({
          orderBy: { createdAt: 'desc' },
          select: { data: true, entityId: true },
          where: {
            entityId: { in: ids },
            entityModel: ActivityEntityModel.INGREDIENT,
            isDeleted: false,
          },
        }),
    );
    for (const activity of activities) {
      if (!activity.entityId || credits.has(activity.entityId)) continue;
      const amount = readActivityCredits(activity.data);
      if (amount !== null) credits.set(activity.entityId, amount);
    }
    return credits;
  }
}
