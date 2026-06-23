import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserProvisioningListener } from './user-provisioning.listener';

describe('UserProvisioningListener', () => {
  let userSetupService: { initializeUserResources: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let listener: UserProvisioningListener;

  beforeEach(() => {
    userSetupService = {
      initializeUserResources: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn() };

    listener = new UserProvisioningListener(
      userSetupService as unknown as UserSetupService,
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
});
