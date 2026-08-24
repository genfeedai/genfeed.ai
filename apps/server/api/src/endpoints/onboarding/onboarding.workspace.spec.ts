import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OnboardingService workspace recovery', () => {
  const loggerService = {
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const membersService = {
    findActiveForUserAccess: vi.fn(),
  };
  const organizationsService = {
    findOne: vi.fn(),
  };
  const usersService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const userSetupService = {
    initializeUserResources: vi.fn(),
  };
  const onboardingPreviewService = {};
  const onboardingReadinessService = {
    getOnboardingStatus: vi.fn(),
  };

  const user = {
    brandId: 'brand_stale',
    organizationId: 'org_stale',
    userId: 'user_1',
  } as unknown as User;

  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    usersService.findOne.mockResolvedValue({
      id: 'user_1',
      lastUsedOrganizationId: 'org_stale',
    });
    usersService.patch.mockResolvedValue({ id: 'user_1' });
    onboardingReadinessService.getOnboardingStatus.mockResolvedValue({
      hasCompletedOnboarding: false,
      isFirstLogin: true,
    });

    service = new OnboardingService(
      loggerService,
      membersService as unknown as MembersService,
      organizationsService as unknown as OrganizationsService,
      usersService as unknown as UsersService,
      userSetupService as unknown as UserSetupService,
      onboardingPreviewService as unknown as OnboardingPreviewService,
      onboardingReadinessService as unknown as OnboardingReadinessService,
    );
  });

  it('recovers a live membership org instead of persisting a stale session org', async () => {
    membersService.findActiveForUserAccess.mockResolvedValue([
      { organizationId: 'org_live' },
    ]);

    await service.getOnboardingStatus(user);

    expect(membersService.findActiveForUserAccess).toHaveBeenCalledWith(
      'user_1',
    );
    expect(organizationsService.findOne).not.toHaveBeenCalled();
    expect(userSetupService.initializeUserResources).not.toHaveBeenCalled();
    expect(usersService.patch).toHaveBeenCalledWith('user_1', {
      lastUsedOrganizationId: 'org_live',
    });
    expect(onboardingReadinessService.getOnboardingStatus).toHaveBeenCalledWith(
      'org_live',
    );
  });

  it('provisions a workspace when the session org is stale and the user has no memberships', async () => {
    membersService.findActiveForUserAccess.mockResolvedValue([]);
    userSetupService.initializeUserResources.mockResolvedValue({
      brand: { id: 'brand_new' },
      organization: { id: 'org_new' },
    });

    await service.getOnboardingStatus(user);

    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'user_1',
      undefined,
      { email: undefined, name: undefined },
    );
    expect(usersService.patch).toHaveBeenCalledWith('user_1', {
      lastUsedOrganizationId: 'org_new',
    });
    expect(onboardingReadinessService.getOnboardingStatus).toHaveBeenCalledWith(
      'org_new',
    );
  });

  it('does not persist a stale session org when provisioning cannot recover a workspace', async () => {
    membersService.findActiveForUserAccess.mockResolvedValue([]);
    userSetupService.initializeUserResources.mockResolvedValue({
      brand: null,
      organization: null,
    });

    let thrown: unknown;
    try {
      await service.getOnboardingStatus(user);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(usersService.patch).not.toHaveBeenCalled();
  });
});
