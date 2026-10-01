import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { MemberRole } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException, Injectable } from '@nestjs/common';
@Injectable()
export class BrandedGenerationReceiptAccessService {
  async assertBrand(
    actor: BrandedGenerationActorV1,
    tx: Prisma.TransactionClient,
  ): Promise<{ isOwnerOrAdmin: boolean }> {
    const [organization, brand, member] = await Promise.all([
      tx.organization.findFirst({
        where: { id: actor.organizationId, isDeleted: false },
        select: { id: true },
      }),
      tx.brand.findFirst({
        where: {
          id: actor.brandId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      tx.member.findFirst({
        where: {
          userId: actor.actorId,
          organizationId: actor.organizationId,
          isDeleted: false,
          isActive: true,
        },
        include: { role: true, brands: { select: { id: true } } },
      }),
    ]);
    if (!organization || !brand || !member)
      throw new ForbiddenException('receipt_access_denied');
    const isOwnerOrAdmin =
      member.role.key === MemberRole.OWNER ||
      member.role.key === MemberRole.ADMIN;
    if (
      !isOwnerOrAdmin &&
      member.brands.length &&
      !member.brands.some((assigned) => assigned.id === actor.brandId)
    )
      throw new ForbiddenException('receipt_access_denied');
    return { isOwnerOrAdmin };
  }
}
