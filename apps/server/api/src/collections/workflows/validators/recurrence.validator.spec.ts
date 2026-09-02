import { RecurrenceValidator } from '@api/collections/workflows/validators/recurrence.validator';
import { WorkflowRecurrenceType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('RecurrenceValidator.validate', () => {
  it('accepts missing recurrence and one-off schedules', () => {
    expect(RecurrenceValidator.validate()).toEqual({ valid: true });
    expect(
      RecurrenceValidator.validate({ type: WorkflowRecurrenceType.ONCE }),
    ).toEqual({ valid: true });
  });

  it('rejects an invalid timezone or a past end date', () => {
    expect(
      RecurrenceValidator.validate({
        timezone: 'Not/AZone',
        type: WorkflowRecurrenceType.DAILY,
      }),
    ).toEqual(
      expect.objectContaining({
        valid: false,
      }),
    );

    expect(
      RecurrenceValidator.validate({
        endDate: new Date(0),
        timezone: 'UTC',
        type: WorkflowRecurrenceType.WEEKLY,
      }),
    ).toEqual({
      error: 'End date must be in the future',
      valid: false,
    });
  });

  it('accepts a future recurring schedule', () => {
    expect(
      RecurrenceValidator.validate({
        endDate: new Date(Date.now() + 60_000),
        timezone: 'America/New_York',
        type: WorkflowRecurrenceType.DAILY,
      }),
    ).toEqual({ valid: true });
  });
});

describe('RecurrenceValidator.calculateFirstRun', () => {
  it('runs immediately when no schedule is provided', () => {
    const before = Date.now();
    const firstRun = RecurrenceValidator.calculateFirstRun();
    expect(firstRun.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('returns the scheduled date, optionally shifted into a timezone', () => {
    const scheduled = new Date('2026-01-15T12:00:00.000Z');
    expect(RecurrenceValidator.calculateFirstRun(scheduled)).toBe(scheduled);

    const shifted = RecurrenceValidator.calculateFirstRun(scheduled, {
      timezone: 'America/New_York',
      type: WorkflowRecurrenceType.DAILY,
    });
    expect(shifted).toBeInstanceOf(Date);
    expect(Number.isNaN(shifted.getTime())).toBe(false);

    const fallback = RecurrenceValidator.calculateFirstRun(scheduled, {
      timezone: 'Not/AZone',
      type: WorkflowRecurrenceType.DAILY,
    });
    expect(fallback).toBe(scheduled);
  });
});
