import { MAX_THREAD_DELAY_MINUTES } from '@genfeedai/contracts/api-types/contracts';
import { planThreadChildDelivery } from '@workers/services/thread-comment-schedule.util';

const PUBLISHED_AT = new Date('2026-09-10T12:00:00.000Z');

describe('planThreadChildDelivery', () => {
  it('sends comments with no delay alongside the parent, in order', () => {
    const plan = planThreadChildDelivery(
      [
        { id: 'child-2', order: 2 },
        { id: 'child-1', order: 1, threadDelayMinutes: 0 },
      ],
      PUBLISHED_AT,
    );

    expect(plan.immediate.map((child) => child.id)).toEqual([
      'child-1',
      'child-2',
    ]);
    expect(plan.delayed).toEqual([]);
  });

  it('parks a delayed comment at its own offset from the publish time', () => {
    const plan = planThreadChildDelivery(
      [
        { id: 'child-1', order: 1 },
        { id: 'child-2', order: 2, threadDelayMinutes: 10 },
      ],
      PUBLISHED_AT,
    );

    expect(plan.immediate.map((child) => child.id)).toEqual(['child-1']);
    expect(plan.delayed).toEqual([
      {
        child: { id: 'child-2', order: 2, threadDelayMinutes: 10 },
        delayMinutes: 10,
        dueAt: new Date('2026-09-10T12:10:00.000Z'),
      },
    ]);
  });

  it('keeps a later comment behind an earlier delayed one', () => {
    const plan = planThreadChildDelivery(
      [
        { id: 'child-1', order: 1, threadDelayMinutes: 30 },
        { id: 'child-2', order: 2, threadDelayMinutes: 5 },
        { id: 'child-3', order: 3 },
      ],
      PUBLISHED_AT,
    );

    expect(plan.immediate).toEqual([]);
    expect(
      plan.delayed.map((entry) => [entry.child.id, entry.delayMinutes]),
    ).toEqual([
      ['child-1', 30],
      ['child-2', 30],
      ['child-3', 30],
    ]);
  });

  it('clamps a delay past the supported window', () => {
    const plan = planThreadChildDelivery(
      [{ id: 'child-1', order: 1, threadDelayMinutes: 10_000_000 }],
      PUBLISHED_AT,
    );

    expect(plan.delayed[0]?.delayMinutes).toBe(MAX_THREAD_DELAY_MINUTES);
  });

  it('treats a negative or fractional delay as whole minutes', () => {
    const plan = planThreadChildDelivery(
      [
        { id: 'child-1', order: 1, threadDelayMinutes: -5 },
        { id: 'child-2', order: 2, threadDelayMinutes: 2.7 },
      ],
      PUBLISHED_AT,
    );

    expect(plan.immediate.map((child) => child.id)).toEqual(['child-1']);
    expect(plan.delayed[0]?.delayMinutes).toBe(2);
  });
});
