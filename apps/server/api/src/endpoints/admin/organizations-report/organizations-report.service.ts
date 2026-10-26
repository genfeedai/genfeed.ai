import {
  type PageWindow,
  toPaginationParams,
} from '@api/helpers/dto/pagination-query.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IOrganizationsReport } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrganizationsReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of organizations, oldest first, with the platform-wide total in
   * `pagination`. Soft-deleted organizations are left out unless asked for.
   */
  async getReport(
    { limit, page, skip }: PageWindow,
    isIncludingDeleted = false,
  ): Promise<IOrganizationsReport> {
    const where = isIncludingDeleted ? {} : { isDeleted: false };
    const [organizations, totalOrganizations] = await Promise.all([
      this.prisma.organization.findMany({
        // `id` keeps equal timestamps from repeating across pages.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          _count: { select: { members: { where: { isDeleted: false } } } },
          accountType: true,
          category: true,
          createdAt: true,
          id: true,
          isDeleted: true,
          label: true,
          onboardingCompleted: true,
          settings: { select: { subscriptionTier: true } },
          slug: true,
          user: { select: { email: true } },
        },
        skip,
        take: limit,
        where,
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      organizations: organizations.map((organization) => ({
        category: organization.accountType ?? organization.category,
        createdAt: organization.createdAt.toISOString(),
        id: organization.id,
        isDeleted: organization.isDeleted,
        isOnboardingCompleted: organization.onboardingCompleted,
        label: organization.label,
        memberCount: organization._count.members,
        ownerEmail: organization.user.email,
        slug: organization.slug,
        subscriptionTier: organization.settings?.subscriptionTier ?? null,
      })),
      pagination: toPaginationParams(totalOrganizations, page, limit),
    };
  }
}
