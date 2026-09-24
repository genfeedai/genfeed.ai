import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { MemberRole } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentReportAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async canReview(
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<boolean> {
    const [member, brand] = await Promise.all([
      this.prisma.member.findFirst({
        where: scopedWhere(organizationId, {
          userId,
          isActive: true,
          user: { is: { isDeleted: false } },
          organization: { is: { isDeleted: false } },
        }),
        include: { role: true },
      }),
      this.prisma.brand.findFirst({
        where: scopedWhere(organizationId, { id: brandId }),
        select: { id: true },
      }),
    ]);
    return Boolean(
      brand &&
        member &&
        [MemberRole.OWNER, MemberRole.ADMIN].includes(
          member.role.key as MemberRole,
        ),
    );
  }
}
