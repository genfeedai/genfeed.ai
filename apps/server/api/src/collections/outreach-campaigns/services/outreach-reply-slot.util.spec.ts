import {
  DEFAULT_REPLY_MAX_PER_DAY,
  DEFAULT_REPLY_MAX_PER_HOUR,
  evaluateReplySlotReservation,
  mergeReservedRateLimits,
  normalizeReplyRateLimitWindows,
  REPLY_SLOT_DAY_MS,
  REPLY_SLOT_HOUR_MS,
} from '@api/collections/outreach-campaigns/services/outreach-reply-slot.util';

describe('outreach reply slot windows', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');

  it('denies an hourly rollover when the daily cap is already exhausted', () => {
    const decision = evaluateReplySlotReservation(
      {
        currentDayCount: 50,
        currentHourCount: 10,
        dayResetAt: new Date(now.getTime() + REPLY_SLOT_HOUR_MS).toISOString(),
        hourResetAt: new Date(now.getTime() - 1).toISOString(),
        maxPerDay: 50,
        maxPerHour: 10,
      },
      now,
    );

    expect(decision.allowed).toBe(false);
  });

  it('denies a daily rollover when the hourly cap is already exhausted', () => {
    const decision = evaluateReplySlotReservation(
      {
        currentDayCount: 50,
        currentHourCount: 10,
        dayResetAt: new Date(now.getTime() - 1).toISOString(),
        hourResetAt: new Date(now.getTime() + REPLY_SLOT_HOUR_MS).toISOString(),
        maxPerDay: 50,
        maxPerHour: 10,
      },
      now,
    );

    expect(decision.allowed).toBe(false);
  });

  it('treats the exact reset timestamp as expired', () => {
    const windows = normalizeReplyRateLimitWindows(
      {
        currentDayCount: 9,
        currentHourCount: 7,
        dayResetAt: now.toISOString(),
        hourResetAt: now.toISOString(),
        maxPerDay: 50,
        maxPerHour: 10,
      },
      now,
    );

    expect(windows.currentDayCount).toBe(0);
    expect(windows.currentHourCount).toBe(0);
    expect(windows.hourResetAt.toISOString()).toBe(
      new Date(now.getTime() + REPLY_SLOT_HOUR_MS).toISOString(),
    );
    expect(windows.dayResetAt.toISOString()).toBe(
      new Date(now.getTime() + REPLY_SLOT_DAY_MS).toISOString(),
    );
  });

  it('increments both normalized counters when both windows have capacity', () => {
    const decision = evaluateReplySlotReservation(
      {
        currentDayCount: 4,
        currentHourCount: 2,
        dayResetAt: new Date(now.getTime() + REPLY_SLOT_DAY_MS).toISOString(),
        delayBetweenRepliesSeconds: 45,
        hourResetAt: new Date(now.getTime() + REPLY_SLOT_HOUR_MS).toISOString(),
        maxPerDay: 50,
        maxPerHour: 10,
      },
      now,
    );

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      return;
    }

    expect(decision.next.currentHourCount).toBe(3);
    expect(decision.next.currentDayCount).toBe(5);
    expect(
      mergeReservedRateLimits(
        {
          currentDayCount: 4,
          currentHourCount: 2,
          delayBetweenRepliesSeconds: 45,
          maxPerDay: 50,
          maxPerHour: 10,
        },
        decision.next,
      ),
    ).toEqual(
      expect.objectContaining({
        currentDayCount: 5,
        currentHourCount: 3,
        delayBetweenRepliesSeconds: 45,
      }),
    );
  });

  it('resets both exhausted counters when both windows have expired', () => {
    const decision = evaluateReplySlotReservation(
      {
        currentDayCount: 50,
        currentHourCount: 10,
        dayResetAt: new Date(now.getTime() - 1).toISOString(),
        hourResetAt: new Date(now.getTime() - 1).toISOString(),
        maxPerDay: 50,
        maxPerHour: 10,
      },
      now,
    );

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      return;
    }

    expect(decision.next.currentHourCount).toBe(1);
    expect(decision.next.currentDayCount).toBe(1);
  });

  it('denies configured zero limits even after a window reset', () => {
    expect(
      evaluateReplySlotReservation(
        {
          currentDayCount: 0,
          currentHourCount: 0,
          maxPerDay: 50,
          maxPerHour: 0,
        },
        now,
      ).allowed,
    ).toBe(false);
    expect(
      evaluateReplySlotReservation(
        {
          currentDayCount: 0,
          currentHourCount: 0,
          maxPerDay: 0,
          maxPerHour: 10,
        },
        now,
      ).allowed,
    ).toBe(false);
  });

  it('uses default caps when max values are omitted', () => {
    const windows = normalizeReplyRateLimitWindows(undefined, now);

    expect(windows.maxPerHour).toBe(DEFAULT_REPLY_MAX_PER_HOUR);
    expect(windows.maxPerDay).toBe(DEFAULT_REPLY_MAX_PER_DAY);
    expect(windows.currentHourCount).toBe(0);
    expect(windows.currentDayCount).toBe(0);
  });
});
