import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { MemberRole } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException, Injectable } from '@nestjs/common';

export interface BrandAccessActor {
  userId: string;
  organizationId: string;
  isApiKey?: boolean;
  scopes?: string[];
}

@Injectable()
export class BrandAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    actor: BrandAccessActor,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const base: Prisma.BrandWhereInput = {
      organizationId: actor.organizationId,
      isDeleted: false,
    };
    if (!actor.organizationId || (isCloudDeployment() && !actor.userId)) {
      throw new ForbiddenException('Brand access denied');
    }
    if (!isCloudDeployment()) {
      return { where: base, role: null, brandIds: undefined };
    }
    const member = await tx.member.findFirst({
      where: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        isActive: true,
        isDeleted: false,
        organization: { isDeleted: false },
        role: { isDeleted: false },
      },
      select: {
        role: { select: { key: true } },
        brands: { where: base, select: { id: true } },
      },
    });
    const membershipRole = Object.values(MemberRole).find(
      (role) => role === member?.role?.key,
    );
    if (!member || !membershipRole) {
      throw new ForbiddenException('Brand access denied');
    }
    const role = resolveApiKeyEffectiveMemberRole(actor, membershipRole);
    const privileged = role === MemberRole.OWNER || role === MemberRole.ADMIN;
    const brandIds = privileged
      ? undefined
      : member.brands.map((brand) => brand.id);
    return {
      where: {
        ...base,
        ...(brandIds === undefined ? {} : { id: { in: brandIds } }),
      },
      role,
      brandIds,
    };
  }

  async predicate(
    actor: BrandAccessActor,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.BrandWhereInput> {
    return (await this.resolve(actor, tx)).where;
  }

  async assert(
    actor: BrandAccessActor,
    brandId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const where = await this.predicate(actor, tx);
    const brand = await tx.brand.findFirst({
      where: { AND: [where, { id: brandId }] },
      select: { id: true },
    });
    if (!brand) throw new ForbiddenException('Brand access denied');
  }
}
