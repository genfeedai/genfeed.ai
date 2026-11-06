import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import type { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

describe('OnboardingService workspace recovery', () => {
  const user = {
    brandId: 'brand_stale',
    organizationId: 'org_stale',
    userId: 'user_1',
  } as unknown as User;

  let users: Map<string, { id: string; lastUsedOrganizationId: string }>;
  let memberships: string[];
  let provisioned: {
    brand: { id: string } | null;
    organization: { id: string } | null;
  };
  let provisionRequests: unknown[][];
  let service: OnboardingService;

  beforeEach(() => {
    users = new Map([
      ['user_1', { id: 'user_1', lastUsedOrganizationId: 'org_stale' }],
    ]);
    memberships = [];
    provisioned = { brand: null, organization: null };
    provisionRequests = [];

    service = new OnboardingService(
      { log: () => {}, warn: () => {} } as unknown as LoggerService,
      {
        findActiveForUserAccess: async (userId: string) =>
          userId === 'user_1'
            ? memberships.map((organizationId) => ({ organizationId }))
            : [],
      } as unknown as MembersService,
      {} as unknown as OrganizationsService,
      {
        findOne: async (where: { id: string }) => users.get(where.id) ?? null,
        patch: async (
          id: string,
          update: { lastUsedOrganizationId: string },
        ) => {
          const row = users.get(id);
          if (row) {
            row.lastUsedOrganizationId = update.lastUsedOrganizationId;
          }
          return row;
        },
      } as unknown as UsersService,
      {
        initializeUserResources: async (...args: unknown[]) => {
          provisionRequests.push(args);
          return provisioned;
        },
      } as unknown as UserSetupService,
      {
        getOnboardingStatus: async (organizationId: string) => ({
          hasCompletedOnboarding: false,
          isFirstLogin: organizationId !== 'org_live',
        }),
      } as unknown as OnboardingReadinessService,
    );
  });

  it('recovers a live membership org instead of persisting a stale session org', async () => {
    memberships = ['org_live'];

    await expect(service.getOnboardingStatus(user)).resolves.toEqual({
      hasCompletedOnboarding: false,
      isFirstLogin: false,
    });

    expect(users.get('user_1')?.lastUsedOrganizationId).toBe('org_live');
    expect(provisionRequests).toEqual([]);
  });

  it('keeps the session org when the user still belongs to it', async () => {
    memberships = ['org_live', 'org_stale'];

    await service.getOnboardingStatus(user);

    expect(users.get('user_1')?.lastUsedOrganizationId).toBe('org_stale');
  });

  it('provisions a workspace when the session org is stale and the user has no memberships', async () => {
    provisioned = {
      brand: { id: 'brand_new' },
      organization: { id: 'org_new' },
    };

    await expect(service.getOnboardingStatus(user)).resolves.toEqual({
      hasCompletedOnboarding: false,
      isFirstLogin: true,
    });

    expect(provisionRequests).toEqual([
      ['user_1', undefined, { email: undefined, name: undefined }],
    ]);
    expect(users.get('user_1')?.lastUsedOrganizationId).toBe('org_new');
  });

  it('does not persist a stale session org when provisioning cannot recover a workspace', async () => {
    await expect(service.getOnboardingStatus(user)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });

    expect(users.get('user_1')?.lastUsedOrganizationId).toBe('org_stale');
  });
});
