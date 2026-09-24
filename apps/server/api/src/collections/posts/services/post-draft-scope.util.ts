import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

export async function assertPostBrandAccess(
  prisma: PrismaService,
  brandId: string,
  organizationId: string,
): Promise<void> {
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, organizationId, isDeleted: false },
    select: { id: true },
  });
  if (!brand) {
    throw new BadRequestException(
      'The selected brand does not exist in this organization',
    );
  }
}
