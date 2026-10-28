import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UserOnboardingCompletionService } from '@api/collections/users/services/user-onboarding-completion.service';
import { describe, expect, it, vi } from 'vitest';

function createService() {
  const state = {
    organization: { onboardingCompleted: false },
    user: { isOnboardingCompleted: false },
  };
  const usersService = {
    findOne: vi.fn(async () => ({ id: 'user-1' })),
    patchAll: vi.fn(async (filter: { isOnboardingCompleted?: boolean }) => {
      if (filter.isOnboardingCompleted !== state.user.isOnboardingCompleted) {
        return { modifiedCount: 0 };
      }
      state.user.isOnboardingCompleted = true;
      return { modifiedCount: 1 };
    }),
  };
  const organizationsService = {
    patch: vi.fn(
      async (_id: string, data: { onboardingCompleted?: boolean }) => {
        Object.assign(state.organization, data);
        return state.organization;
      },
    ),
  };
  const service = new UserOnboardingCompletionService(
    usersService as never,
    { invalidateAll: vi.fn() } as never,
    { emitAsync: vi.fn() } as never,
    organizationsService as never,
  );
  return { service, state };
}

const WIZARD_USER = {
  id: 'user-1',
  organizationId: 'organization-1',
  userId: 'user-1',
} as User;

describe('UserOnboardingCompletionService', () => {
  it('marks the organization set up when the wizard completes, so lifecycle emails stop treating it as unfinished', async () => {
    const { service, state } = createService();

    await service.complete(WIZARD_USER);

    expect(state.user.isOnboardingCompleted).toBe(true);
    expect(state.organization.onboardingCompleted).toBe(true);
  });

  it('repairs the organization when the user was already completed by an earlier call', async () => {
    const { service, state } = createService();
    state.user.isOnboardingCompleted = true;

    await service.complete(WIZARD_USER);

    expect(state.organization.onboardingCompleted).toBe(true);
  });
});
