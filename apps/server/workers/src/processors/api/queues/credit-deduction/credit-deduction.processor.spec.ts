import { ActivitySource } from '@genfeedai/enums';
import type { CreditDeductionJobData } from '@genfeedai/queue-contracts';
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CreditDeductionProcessor', () => {
  let processor: CreditDeductionProcessor;
  let creditsUtilsService: {
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    creditsUtilsService = {
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(5000),
    };

    processor = new CreditDeductionProcessor(
      creditsUtilsService as never,
      { createTransactionEntry: vi.fn() } as never,
      { sendLowCreditsAlert: vi.fn() } as never,
      { getPublisher: vi.fn() } as never,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never,
    );
  });

  it('passes completion billing references into the credit utility', async () => {
    const data: CreditDeductionJobData = {
      amount: 18,
      description: 'Fleet voice clone compute',
      idempotencyKey: 'fleet-voice-clone-job-1',
      metadata: {
        fleetJobId: 'job-1',
        processTimeSeconds: 61,
      },
      organizationId: 'org-1',
      referenceId: 'job-1',
      referenceType: 'fleet:voice-clone',
      source: ActivitySource.VOICE_GENERATION,
      type: 'deduct-credits',
      userId: 'user-1',
    };

    await processor.process({
      attemptsMade: 0,
      data,
      id: 'credit-deduct-org-1-fleet-voice-clone-job-1',
      opts: { attempts: 3 },
    } as Job<CreditDeductionJobData>);

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      18,
      'Fleet voice clone compute',
      ActivitySource.VOICE_GENERATION,
      {
        maxOverdraftCredits: undefined,
        metadata: {
          fleetJobId: 'job-1',
          processTimeSeconds: 61,
        },
        referenceId: 'job-1',
        referenceType: 'fleet:voice-clone',
      },
    );
  });
});
