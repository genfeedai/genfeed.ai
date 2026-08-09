import type { SignupPrefillJobData } from '@genfeedai/queue-contracts';
import { SignupPrefillProcessor } from '@workers/processors/api/queues/signup-prefill/signup-prefill.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(overrides: {
  attemptsMade?: number;
  attempts?: number;
}): Job<SignupPrefillJobData> {
  return {
    attemptsMade: overrides.attemptsMade ?? 0,
    data: {
      brandId: 'brand-1',
      email: 'founder@acme.com',
      organizationId: 'org-1',
      userId: 'user-1',
    },
    opts: { attempts: overrides.attempts ?? 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SignupPrefillJobData>;
}

describe('SignupPrefillProcessor', () => {
  let processor: SignupPrefillProcessor;
  let signupPrefillService: {
    markPrefillFailed: ReturnType<typeof vi.fn>;
    prefillBrand: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    signupPrefillService = {
      markPrefillFailed: vi.fn().mockResolvedValue(undefined),
      prefillBrand: vi.fn().mockResolvedValue(undefined),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    processor = new SignupPrefillProcessor(
      signupPrefillService as never,
      logger as never,
    );
  });

  it('prefills the brand and reports progress', async () => {
    const job = buildJob({});

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(5);
    expect(signupPrefillService.prefillBrand).toHaveBeenCalledWith(
      job.data,
      expect.any(Function),
    );

    const onProgress = signupPrefillService.prefillBrand.mock.calls[0][1] as (
      percent: number,
    ) => void;
    onProgress(42);
    expect(job.updateProgress).toHaveBeenCalledWith(42);
  });

  it('rethrows mid-run failures without marking the brand failed', async () => {
    signupPrefillService.prefillBrand.mockRejectedValue(
      new Error('scrape failed'),
    );
    const job = buildJob({ attempts: 3, attemptsMade: 0 });

    await expect(processor.process(job)).rejects.toThrow('scrape failed');
    expect(signupPrefillService.markPrefillFailed).not.toHaveBeenCalled();
  });

  it('marks the prefill failed on the final attempt', async () => {
    signupPrefillService.prefillBrand.mockRejectedValue(
      new Error('scrape failed'),
    );
    const job = buildJob({ attempts: 3, attemptsMade: 2 });

    await expect(processor.process(job)).rejects.toThrow('scrape failed');
    expect(signupPrefillService.markPrefillFailed).toHaveBeenCalledWith(
      'brand-1',
    );
  });
});
