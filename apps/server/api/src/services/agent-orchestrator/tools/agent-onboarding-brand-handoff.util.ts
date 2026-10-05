import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isExpertAccountType } from '@genfeedai/contracts/constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

export async function completeExpertBrandHandoff(
  ctx: ToolExecutionContext,
  brandsService: Pick<BrandsService, 'findOne'>,
  organizationsService?: OrganizationsService,
  usersService?: UsersService,
  userAccessCacheService?: UserAccessCacheService,
) {
  const organization = await organizationsService?.findOne({
    id: ctx.organizationId,
    isDeleted: false,
  });
  if (!isExpertAccountType(organization?.accountType)) {
    throw new ForbiddenException('Expert onboarding is required');
  }
  const brandId = ctx.validatedScope?.brandId ?? ctx.brandId;
  if (
    !brandId ||
    !(await brandsService.findOne({
      id: brandId,
      organizationId: ctx.organizationId,
      isDeleted: false,
    }))
  ) {
    throw new BadRequestException('A saved brand is required');
  }
  const user = await usersService?.findOne({
    id: ctx.userId,
    isDeleted: false,
  });
  if (!user || !usersService) throw new BadRequestException('User unavailable');
  if (user.isOnboardingCompleted)
    throw new ConflictException('Onboarding is already completed');
  const updated = await usersService.patch(ctx.userId, {
    onboardingStepsCompleted: [
      ...new Set([...(user.onboardingStepsCompleted ?? []), 'brand']),
    ],
    ...(!user.onboardingStartedAt ? { onboardingStartedAt: new Date() } : {}),
  });
  await userAccessCacheService?.invalidateAll(ctx.userId);
  return updated;
}
