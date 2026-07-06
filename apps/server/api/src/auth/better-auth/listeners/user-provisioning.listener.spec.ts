import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserProvisioningListener } from './user-provisioning.listener';

describe('UserProvisioningListener', () => {
  let userSetupService: { initializeUserResources: ReturnType<typeof vi.fn> };
  let lifecycleEmailService: {
    scheduleSignupLifecycle: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let listener: UserProvisioningListener;

  beforeEach(() => {
    userSetupService = {
      initializeUserResources: vi.fn().mockResolvedValue(undefined),
    };
    lifecycleEmailService = {
      scheduleSignupLifecycle: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    listener = new UserProvisioningListener(
      userSetupService as unknown as UserSetupService,
      lifecycleEmailService as unknown as LifecycleEmailService,
      logger as unknown as LoggerService,
    );
  });

  it('provisions resources for the newly created user', async () => {
    await listener.handleUserCreated({
      email: 'new@genfeed.ai',
      userId: 'u_1',
    });

    expect(userSetupService.initializeUserResources).toHaveBeenCalledWith(
      'u_1',
    );
    expect(lifecycleEmailService.scheduleSignupLifecycle).toHaveBeenCalledWith(
      'u_1',
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not throw when provisioning fails — logs for ops instead', async () => {
    userSetupService.initializeUserResources.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      listener.handleUserCreated({ email: null, userId: 'u_2' }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('does not fail provisioning when lifecycle email scheduling fails', async () => {
    lifecycleEmailService.scheduleSignupLifecycle.mockRejectedValue(
      new Error('queue down'),
    );

    await expect(
      listener.handleUserCreated({
        email: 'new@genfeed.ai',
        userId: 'u_3',
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
