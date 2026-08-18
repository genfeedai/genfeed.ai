import {
  SignupPrefillQueueService,
  signupPrefillJobId,
} from '@api/services/signup-prefill/signup-prefill-queue.service';
import { describe, expect, it, vi } from 'vitest';

describe('signupPrefillJobId', () => {
  it('mints a BullMQ-safe id without colons', () => {
    expect(signupPrefillJobId('user-1')).toBe('signup-prefill-user-1');
    expect(signupPrefillJobId('user-1')).not.toContain(':');
  });
});

describe('SignupPrefillQueueService', () => {
  it('enqueues one deterministic job per user', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'signup-prefill-user-1' }),
    };
    const service = new SignupPrefillQueueService(
      queue as never,
      { log: vi.fn() } as never,
    );

    await service.enqueuePrefill({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'prefill-brand',
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ jobId: 'signup-prefill-user-1' }),
    );
  });
});
