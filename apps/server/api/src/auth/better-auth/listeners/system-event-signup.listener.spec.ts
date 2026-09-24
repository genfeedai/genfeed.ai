import { SystemEventSignupListener } from '@api/auth/better-auth/listeners/system-event-signup.listener';
import type { SystemEventsService } from '@api/services/system-events/system-events.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('signup system event listener', () => {
  it('uses the canonical user ID and never fails signup on outbox errors', async () => {
    const recordSignup = vi
      .fn()
      .mockRejectedValue(new Error('private database detail'));
    const warn = vi.fn();
    const listener = new SystemEventSignupListener(
      { recordSignup } as unknown as SystemEventsService,
      { warn } as unknown as LoggerService,
    );
    await expect(
      listener.onSignup({ userId: 'canonical-id', email: null }),
    ).resolves.toBeUndefined();
    expect(recordSignup).toHaveBeenCalledWith('canonical-id');
    expect(warn).toHaveBeenCalledWith(
      'Signup system event will be recovered by the worker',
    );
  });
});
