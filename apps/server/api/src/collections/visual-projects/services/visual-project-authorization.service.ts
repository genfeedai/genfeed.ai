import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class VisualProjectAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}
  async authorizeBrand(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<void> {
    const [brand, member] = await Promise.all([
      this.prisma.brand.findFirst({
        where: {
          id: brandId,
          organizationId: user.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      this.prisma.member.findFirst({
        where: {
          userId: user.userId,
          organizationId: user.organizationId,
          isDeleted: false,
          isActive: true,
        },
        include: { role: true, brands: { select: { id: true } } },
      }),
    ]);
    if (!brand || !member)
      throw new ForbiddenException(
        'An active membership and accessible brand are required.',
      );
    const isAdmin =
      member.role.key === MemberRole.OWNER ||
      member.role.key === MemberRole.ADMIN;
    if (
      !isAdmin &&
      member.brands.length &&
      !member.brands.some((assigned) => assigned.id === brandId)
    )
      throw new ForbiddenException(
        'This brand is not available to the current actor.',
      );
  }
  async project(user: AuthenticatedUser, id: string) {
    const project = await this.prisma.visualProject.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        brandId: user.brandId || undefined,
        isDeleted: false,
      },
    });
    if (!project) throw new NotFoundException('Visual project unavailable.');
    await this.authorizeBrand(user, project.brandId);
    return project;
  }
  async revision(user: AuthenticatedUser, projectId: string, number: number) {
    const project = await this.project(user, projectId);
    const revision = await this.prisma.visualRevision.findFirst({
      where: {
        projectId,
        number,
        organizationId: user.organizationId,
        brandId: project.brandId,
        isDeleted: false,
      },
    });
    if (!revision) throw new NotFoundException('Visual revision unavailable.');
    return revision;
  }
}
