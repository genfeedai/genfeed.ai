import { ActivitySource } from '@genfeedai/contracts';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import type { Request } from 'express';

import {
  finalizeDeferredTextCredits,
  finalizeOutputCredits,
  TEXT_MAX_OVERDRAFT_CREDITS,
} from './finalize-deferred-credits.util';

type TestCreditsRequest = Request & {
  creditsConfig?: CreditsConfig & {
    deferred?: boolean;
    maxOverdraftCredits?: number;
  };
};

describe('finalizeDeferredTextCredits', () => {
  it('leaves requests without deferred credit metadata unchanged', () => {
    const request = {
      creditsConfig: {
        amount: 2,
        deferred: false,
        description: 'Existing charge',
      },
    } as TestCreditsRequest;
    const originalConfig = request.creditsConfig;

    finalizeDeferredTextCredits(request, 7);

    expect(request.creditsConfig).toBe(originalConfig);
  });

  it('leaves requests without credit metadata unchanged', () => {
    const request = {} as TestCreditsRequest;

    finalizeDeferredTextCredits(request, 7);

    expect(request.creditsConfig).toBeUndefined();
  });

  it('settles deferred credits while preserving decorator metadata', () => {
    const request = {
      creditsConfig: {
        deferred: true,
        description: 'Text generation',
        isByokBypass: true,
        modelKey: 'provider/model',
        source: ActivitySource.SCRIPT,
      },
    } as TestCreditsRequest;

    finalizeDeferredTextCredits(request, 7);

    expect(request.creditsConfig).toEqual({
      amount: 7,
      deferred: false,
      description: 'Text generation',
      isByokBypass: true,
      maxOverdraftCredits: TEXT_MAX_OVERDRAFT_CREDITS,
      modelKey: 'provider/model',
      source: ActivitySource.SCRIPT,
    });
  });

  it('finalizes a zero-credit operation so the interceptor can skip deduction', () => {
    const request = {
      creditsConfig: {
        deferred: true,
        description: 'Text generation',
      },
    } as TestCreditsRequest;

    finalizeDeferredTextCredits(request, 0);

    expect(request.creditsConfig).toMatchObject({
      amount: 0,
      deferred: false,
      maxOverdraftCredits: TEXT_MAX_OVERDRAFT_CREDITS,
    });
  });
});

describe('finalizeOutputCredits', () => {
  it('reduces a preflighted multi-output charge to persisted output count', () => {
    const request = {
      creditsConfig: {
        amount: 3,
        description: 'Source post variations',
      },
    } as TestCreditsRequest;

    finalizeOutputCredits(request, 2);

    expect(request.creditsConfig).toEqual({
      amount: 2,
      deferred: false,
      description: 'Source post variations',
    });
  });
});
