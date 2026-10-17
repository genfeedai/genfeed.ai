import { dispatchFundedSubmission } from '@api/collections/workflows/services/workflow-funded-dispatch.util';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

const target = {
  context: { organizationId: 'org-1' } as ExecutionContext,
  continuationId: 'cont-1',
  ingredientId: 'out-1',
};

function setup(options: { bind?: Error; isRejected?: boolean } = {}) {
  const funding = {
    bind: options.bind
      ? vi.fn().mockRejectedValue(options.bind)
      : vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
  };
  const failContinuation = vi.fn().mockResolvedValue(undefined);
  const isRejected = vi.fn().mockReturnValue(options.isRejected ?? false);
  return { failContinuation, funding, isRejected };
}

describe('dispatchFundedSubmission', () => {
  it('returns the submission result without releasing anything', async () => {
    const { failContinuation, funding, isRejected } = setup();

    await expect(
      dispatchFundedSubmission({
        failContinuation,
        funding,
        isRejected,
        submit: () => Promise.resolve('ok'),
        target,
      }),
    ).resolves.toBe('ok');
    expect(funding.bind).toHaveBeenCalledWith('out-1');
    expect(funding.reject).not.toHaveBeenCalled();
    expect(failContinuation).not.toHaveBeenCalled();
  });

  it('fails the continuation and releases the hold when binding fails', async () => {
    const { failContinuation, funding, isRejected } = setup({
      bind: new Error('no hold'),
    });
    const submit = vi.fn();

    await expect(
      dispatchFundedSubmission({
        failContinuation,
        funding,
        isRejected,
        submit,
        target,
      }),
    ).rejects.toThrow('no hold');
    expect(submit).not.toHaveBeenCalled();
    expect(failContinuation).toHaveBeenCalledWith({
      continuationId: 'cont-1',
      error: 'no hold',
      organizationId: 'org-1',
    });
    expect(funding.reject).toHaveBeenCalledWith('out-1');
  });

  it('releases the hold when the provider definitively refuses the job', async () => {
    const { failContinuation, funding, isRejected } = setup({
      isRejected: true,
    });

    await expect(
      dispatchFundedSubmission({
        failContinuation,
        funding,
        isRejected,
        submit: () => Promise.reject(new Error('refused')),
        target,
      }),
    ).rejects.toThrow('refused');
    expect(failContinuation).not.toHaveBeenCalled();
    expect(funding.reject).toHaveBeenCalledWith('out-1');
  });

  it('keeps the hold on an ambiguous submission failure', async () => {
    const { failContinuation, funding, isRejected } = setup();

    await expect(
      dispatchFundedSubmission({
        failContinuation,
        funding,
        isRejected,
        submit: () => Promise.reject(new Error('timeout')),
        target,
      }),
    ).rejects.toThrow('timeout');
    expect(funding.reject).not.toHaveBeenCalled();
    expect(failContinuation).not.toHaveBeenCalled();
  });
});
