import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Operator curation of genfeed.ai/community (#9670). A featured image or video
 * leads the community page, so only a platform superadmin sets the flag, and
 * only on media the community already shows: public, generated, not deleted.
 * The write is scoped to the organization named in the route.
 */
@Traced()
@Injectable()
export class AdminFeaturedMediaService {
  constructor(private readonly prisma: PrismaService) {}

  async setFeatured(
    organizationId: string,
    ingredientId: string,
    isHighlighted: boolean,
  ): Promise<{ id: string; isHighlighted: boolean }> {
    const { count } = await runWithTenantContext({ organizationId }, () =>
      this.prisma.ingredient.updateMany({
        data: { isHighlighted },
        where: scopedWhere(organizationId, {
          category: {
            in: [
              CategoryPrismaUtil.toIngredientCategory(IngredientCategory.IMAGE),
              CategoryPrismaUtil.toIngredientCategory(IngredientCategory.VIDEO),
            ],
          },
          id: ingredientId,
          scope: CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC),
          status: CategoryPrismaUtil.toIngredientStatus(
            IngredientStatus.GENERATED,
          ),
        }),
      }),
    );
    if (count === 0) {
      throw new NotFoundException('Public media', ingredientId);
    }
    return { id: ingredientId, isHighlighted };
  }
}
