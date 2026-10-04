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
    recordSubmissionRejection: vi.fn().mockResolvedValue(undefined),
    releasePool: vi.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    ingredient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return { tasks, billing, prisma };
}
const billingRequest = { creditsConfig: { reservationId: 'hold' } };

describe('compensateCrunDispatchFailure', () => {
  it('fails an output with no task row tenant-scoped and releases the pool', async () => {
    const f = fixture({ a: null });
    await compensateCrunDispatchFailure(f as never, {
      organizationId: 'org',
      ingredientIds: ['a'],
      billingRequest: billingRequest as never,
    });
    expect(f.prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'a',
        organizationId: 'org',
        isDeleted: false,
        status: 'PROCESSING',
      },
      data: { status: 'FAILED' },
    });
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
    expect(f.prisma.ingredient.updateMany).not.toHaveBeenCalled();
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
