import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

export async function assertProviderOfferAvailable(
  prisma: PrismaService,
  id: string,
  provider: string,
  organizationId: string,
) {
  const [offer, setting] = await Promise.all([
    prisma.modelProviderOffer.findFirst({
      where: {
        id,
        isActive: true,
        model: {
          isDeleted: false,
          isActive: true,
          OR: [{ organizationId }, { organizationId: null }],
        },
        executionModel: {
          isDeleted: false,
          isActive: true,
          OR: [{ organizationId }, { organizationId: null }],
        },
      },
      include: { model: true, executionModel: true },
    }),
    prisma.providerRoutingSetting.findUnique({ where: { provider } }),
  ]);
  if (
    !offer ||
    offer.executionModel.provider !== provider ||
    setting?.isActive === false ||
    (offer.model.pinnedProvider && offer.model.pinnedProvider !== provider)
  )
    throw new ConflictException(
      'Provider routing changed. Request a fresh quote.',
    );
  return offer.executionModel;
}
