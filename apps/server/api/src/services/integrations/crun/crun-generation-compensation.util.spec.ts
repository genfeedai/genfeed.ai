import { compensateCrunDispatchFailure } from '@api/services/integrations/crun/crun-generation-compensation.util';

function fixture(states: Record<string, string | null>) {
  const tasks = {
    findForIngredient: vi
      .fn()
      .mockImplementation(async (_org: string, id: string) =>
        states[id] ? { id: `task-${id}`, state: states[id] } : null,
      ),
    failPrepared: vi.fn().mockResolvedValue(undefined),
  };
  const billing = {
    abortUnsubmittedOutput: vi.fn().mockResolvedValue(undefined),
    recordSubmissionRejection: vi.fn().mockResolvedValue(undefined),
    releasePool: vi.fn().mockResolvedValue(undefined),
  };
  return { tasks, billing };
}
const billingRequest = { creditsConfig: { reservationId: 'hold' } };

describe('compensateCrunDispatchFailure', () => {
  it('aborts an output with no task row through billing and releases the pool', async () => {
    const f = fixture({ a: null });
    await compensateCrunDispatchFailure(f as never, {
      organizationId: 'org',
      ingredientIds: ['a'],
      billingRequest: billingRequest as never,
    });
    expect(f.billing.abortUnsubmittedOutput).toHaveBeenCalledWith('a', 'org');
    expect(f.tasks.failPrepared).not.toHaveBeenCalled();
    expect(f.billing.releasePool).toHaveBeenCalledWith(billingRequest);
  });
  it('fails prepared tasks through the rejection path and leaves claimed ones alone', async () => {
    const f = fixture({ a: 'prepared', b: 'prepared', c: 'pending' });
    await compensateCrunDispatchFailure(f as never, {
      organizationId: 'org',
      ingredientIds: ['a', 'b', 'c'],
      billingRequest: billingRequest as never,
    });
    expect(f.tasks.failPrepared).toHaveBeenCalledTimes(2);
    expect(f.billing.recordSubmissionRejection.mock.calls).toEqual([
      ['a', 'org'],
      ['b', 'org'],
    ]);
    expect(f.billing.abortUnsubmittedOutput).not.toHaveBeenCalled();
    expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
  });
  it('still releases the pool when one output cannot be compensated', async () => {
    const f = fixture({ a: 'prepared', b: 'prepared' });
    f.tasks.failPrepared.mockRejectedValueOnce(new Error('db'));
    await compensateCrunDispatchFailure(f as never, {
      organizationId: 'org',
      ingredientIds: ['a', 'b'],
      billingRequest: billingRequest as never,
    });
    expect(f.billing.recordSubmissionRejection).toHaveBeenCalledTimes(1);
    expect(f.billing.releasePool).toHaveBeenCalledTimes(1);
  });
});
