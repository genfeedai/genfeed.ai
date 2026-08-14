import type {
  UserSetupResult,
  UserSetupService,
} from '@api/collections/users/services/user-setup.service';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import type { SignupPrefillQueueService } from '@api/services/signup-prefill/signup-prefill-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserProvisioningListener } from './user-provisioning.listener';

function buildSetupResult(): UserSetupResult {
  return {
    brand: { id: 'b_1' },
    organization: { id: 'o_1' },
  } as unknown as UserSetupResult;
}

/**
 * Microtask turns yielded before asserting that the listener finished. With every
 * collaborator mocked the provisioning chain is pure microtask work — no timers,
 * no I/O — so a fixed drain is deterministic where a wall-clock race is not: the
 * assertion never consults the clock, and a busy CI runner can never report a
 * healthy listener as blocked. Sized far above the handful of turns the chain
 * actually needs so that adding an awaited step does not silently re-flake it.
 */
const MICROTASK_DRAIN_TURNS = 50;

/**
 * Yield the microtask queue a bounded number of times. Bounded by construction:
 * if the listener ever starts awaiting the background enqueue, this returns
 * anyway and the caller's assertion fails immediately instead of hanging.
 */
async function drainMicrotasks(): Promise<void> {
  for (let turn = 0; turn < MICROTASK_DRAIN_TURNS; turn += 1) {
    await Promise.resolve();
  }
}

describe('UserProvisioningListener', () => {
  let userSetupService: { initializeUserResources: ReturnType<typeof vi.fn> };
  let lifecycleEmailService: {
    scheduleSignupLifecycle: ReturnType<typeof vi.fn>;
  };
  let signupPrefillQueueService: {
    enqueuePrefill: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let listener: UserProvisioningListener;

  beforeEach(() => {
    userSetupService = {
      initializeUserResources: vi.fn().mockResolvedValue(buildSetupResult()),
    };
    lifecycleEmailService = {
      scheduleSignupLifecycle: vi.fn().mockResolvedValue(undefined),
    };
    signupPrefillQueueService = {
      enqueuePrefill: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    listener = new UserProvisioningListener(
      userSetupService as unknown as UserSetupService,
      lifecycleEmailService as unknown as LifecycleEmailService,
      signupPrefillQueueService as unknown as SignupPrefillQueueService,
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
      undefined,
      { email: 'new@genfeed.ai' },
    );
    expect(lifecycleEmailService.scheduleSignupLifecycle).toHaveBeenCalledWith(
      'u_1',
    );
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('schedules the background brand prefill with the signup email', async () => {
    await listener.handleUserCreated({
      email: 'vincent@acme.com',
      userId: 'u_1',
    });

    expect(signupPrefillQueueService.enqueuePrefill).toHaveBeenCalledWith({
      brandId: 'b_1',
      email: 'vincent@acme.com',
      organizationId: 'o_1',
      userId: 'u_1',
    });
  });

  it('omits the email when the signup carried none', async () => {
    await listener.handleUserCreated({ email: null, userId: 'u_1' });

    expect(signupPrefillQueueService.enqueuePrefill).toHaveBeenCalledWith({
      brandId: 'b_1',
      email: undefined,
      organizationId: 'o_1',
      userId: 'u_1',
    });
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
    expect(signupPrefillQueueService.enqueuePrefill).not.toHaveBeenCalled();
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

  it('does not fail provisioning when the prefill queue is unavailable', async () => {
    signupPrefillQueueService.enqueuePrefill.mockRejectedValue(
      new Error('redis down'),
    );

    await expect(
      listener.handleUserCreated({
        email: 'new@genfeed.ai',
        userId: 'u_4',
      }),
    ).resolves.toBeUndefined();

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(1));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not wait for a stalled prefill enqueue', async () => {
    signupPrefillQueueService.enqueuePrefill.mockReturnValue(
      new Promise<void>(() => undefined),
    );

    let outcome: 'blocked on enqueue' | 'provisioned' = 'blocked on enqueue';
    const handled = listener
      .handleUserCreated({
        email: 'new@genfeed.ai',
        userId: 'u_5',
      })
      .then(() => {
        outcome = 'provisioned';
      });

    await drainMicrotasks();

    // The stall path was genuinely exercised, and the listener settled anyway.
    expect(signupPrefillQueueService.enqueuePrefill).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('provisioned');
    await handled;
  });
});
