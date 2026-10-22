import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

export async function assertCampaignAssets(
  prisma: PrismaService,
  organizationId: string,
  brandId: string,
  assetIds: readonly string[],
): Promise<void> {
  if (assetIds.length === 0) return;
  if (assetIds.length > 50 || new Set(assetIds).size !== assetIds.length) {
    throw new BadRequestException('Choose at most 50 unique campaign assets.');
  }
  const assets = await prisma.ingredient.findMany({
    select: { id: true },
    where: {
      organizationId,
      brandId,
      isDeleted: false,
      id: { in: [...assetIds] },
      status: {
        notIn: [
          IngredientStatus.FAILED,
          IngredientStatus.ARCHIVED,
          IngredientStatus.REJECTED,
        ],
      },
    },
  });
  if (assets.length !== assetIds.length) {
    throw new BadRequestException(
      'Every campaign asset must be available in the campaign brand Library.',
    );
  }
}
