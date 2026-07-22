import {
  previewRecurrenceOccurrences,
  recurrencePreviewInputSchema,
} from '@api-types/contracts/recurrence-preview.contract';
import { PostFrequency } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

describe('recurrence preview contract', () => {
  test('expands daily intervals and stops at the repeat cap', () => {
    const result = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 2,
        maxRepeats: 3,
      },
      startAt: '2026-01-01T14:00:00.000Z',
      timezone: 'America/New_York',
    });

    expect(result).toEqual({
      exhausted: true,
      occurrences: [
        '2026-01-03T14:00:00.000Z',
        '2026-01-05T14:00:00.000Z',
        '2026-01-07T14:00:00.000Z',
      ],
      success: true,
    });
  });

  test('expands selected weekdays only in active weekly intervals', () => {
    const result = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.WEEKLY,
        interval: 2,
        maxRepeats: 3,
        weekdays: [1, 3, 5],
      },
      startAt: '2026-08-03T07:00:00.000Z',
      timezone: 'Europe/Amsterdam',
    });

    expect(result).toEqual({
      exhausted: true,
      occurrences: [
        '2026-08-05T07:00:00.000Z',
        '2026-08-07T07:00:00.000Z',
        '2026-08-17T07:00:00.000Z',
      ],
      success: true,
    });
  });

  test('preserves local wall-clock time across daylight-saving changes', () => {
    const result = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 1,
        maxRepeats: 3,
      },
      startAt: '2026-03-06T14:00:00.000Z',
      timezone: 'America/New_York',
    });

    expect(result).toEqual({
      exhausted: true,
      occurrences: [
        '2026-03-07T14:00:00.000Z',
        '2026-03-08T13:00:00.000Z',
        '2026-03-09T13:00:00.000Z',
      ],
      success: true,
    });
  });

  test('stops at an inclusive end date', () => {
    const result = previewRecurrenceOccurrences({
      recurrence: {
        endDate: '2026-01-03T09:00:00.000Z',
        frequency: PostFrequency.DAILY,
        interval: 1,
      },
      startAt: '2026-01-01T09:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result).toEqual({
      exhausted: true,
      occurrences: [
        '2026-01-02T09:00:00.000Z',
        '2026-01-03T09:00:00.000Z',
      ],
      success: true,
    });
  });

  test('returns no occurrences when a repeat cap is already exhausted', () => {
    const result = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.MONTHLY,
        interval: 1,
        maxRepeats: 2,
      },
      repeatCount: 2,
      startAt: '2026-01-31T09:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result).toEqual({
      exhausted: true,
      occurrences: [],
      success: true,
    });
  });

  test('returns typed failures for invalid input and IANA timezones', () => {
    const invalidRule = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.WEEKLY,
        interval: 1,
        maxRepeats: 2,
        weekdays: [],
      },
      startAt: '2026-01-01T09:00:00.000Z',
      timezone: 'UTC',
    });
    const invalidTimezone = previewRecurrenceOccurrences({
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 1,
        maxRepeats: 2,
      },
      startAt: '2026-01-01T09:00:00.000Z',
      timezone: 'Mars/Olympus_Mons',
    });

    expect(invalidRule).toMatchObject({
      issues: [{ code: 'invalid_input', path: 'recurrence.weekdays' }],
      success: false,
    });
    expect(invalidTimezone).toEqual({
      issues: [
        {
          code: 'invalid_timezone',
          message: 'Invalid IANA timezone: Mars/Olympus_Mons',
          path: 'timezone',
        },
      ],
      success: false,
    });
  });

  test('caps previews without claiming the finite recurrence is exhausted', () => {
    const result = previewRecurrenceOccurrences({
      limit: 2,
      recurrence: {
        frequency: PostFrequency.DAILY,
        interval: 1,
        maxRepeats: 4,
      },
      startAt: '2026-01-01T09:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result).toEqual({
      exhausted: false,
      occurrences: [
        '2026-01-02T09:00:00.000Z',
        '2026-01-03T09:00:00.000Z',
      ],
      success: true,
    });
  });

  test('applies schema defaults deterministically', () => {
    const parsed = recurrencePreviewInputSchema.parse({
      recurrence: {
        frequency: PostFrequency.YEARLY,
        interval: 1,
        maxRepeats: 1,
      },
      startAt: '2026-01-01T09:00:00.000Z',
      timezone: 'UTC',
    });

    expect(parsed.limit).toBe(100);
    expect(parsed.repeatCount).toBe(0);
  });
});
