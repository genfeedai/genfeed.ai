import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { completeExpertBrandHandoff } from '@api/services/agent-orchestrator/tools/agent-onboarding-brand-handoff.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentOnboardingBrandHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly userAccessCacheService: UserAccessCacheService,
  ) {}

  async complete(
    userId: string,
    organizationId: string,
    brandId?: string | null,
  ) {
    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId, isActive: true, isDeleted: false },
    });
    if (!member) throw new NotFoundException('Organization membership');
    return completeExpertBrandHandoff(
      { userId, organizationId, brandId: brandId ?? undefined },
      this.brandsService,
      this.organizationsService,
      this.usersService,
      this.userAccessCacheService,
    );
  }
}
