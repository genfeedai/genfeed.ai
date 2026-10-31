import { describe, expect, it } from 'vitest';

import {
  CUSTOM_CADENCE_VALUE,
  describeCadence,
  extractScheduleErrorMessage,
  formatNextRunAt,
  resolveCadencePresetValue,
  WORKFLOW_SCHEDULE_PRESETS,
} from './schedule-cadence';

describe('resolveCadencePresetValue', () => {
  it('resolves a preset cron to its preset value', () => {
    expect(resolveCadencePresetValue('0 9 * * 1-5')).toBe('0 9 * * 1-5');
  });

  it('resolves a non-preset cron to the custom sentinel', () => {
    expect(resolveCadencePresetValue('15 7 * * 3')).toBe(CUSTOM_CADENCE_VALUE);
  });

  it('resolves an empty expression to an empty selection', () => {
    expect(resolveCadencePresetValue('   ')).toBe('');
  });
});

describe('formatNextRunAt', () => {
  it('formats a 9:00 AM UTC instant in the workflow timezone, not the viewer zone', () => {
    expect(formatNextRunAt('2026-08-19T09:00:00.000Z', 'UTC')).toBe(
      '9:00 AM UTC',
    );
  });

  it('formats the same instant in Europe/Malta as 11:00 AM', () => {
    expect(formatNextRunAt('2026-08-19T09:00:00.000Z', 'Europe/Malta')).toMatch(
      /^11:00 AM/,
    );
  });

  it('returns null for a missing or invalid instant', () => {
    expect(formatNextRunAt(null, 'UTC')).toBeNull();
    expect(formatNextRunAt('not-a-date', 'UTC')).toBeNull();
  });
});

describe('describeCadence', () => {
  it('returns the preset label for a preset cron', () => {
    for (const preset of WORKFLOW_SCHEDULE_PRESETS) {
      expect(describeCadence(preset.cron)).toBe(preset.label);
    }
  });

  it('falls back to the raw cron for custom expressions', () => {
    expect(describeCadence('15 7 * * 3')).toBe('15 7 * * 3');
  });

  it('returns null when no schedule is set', () => {
    expect(describeCadence(undefined)).toBeNull();
    expect(describeCadence(null)).toBeNull();
    expect(describeCadence('')).toBeNull();
  });
});

describe('extractScheduleErrorMessage', () => {
  it('reads the NestJS error body message', () => {
    expect(
      extractScheduleErrorMessage(
        { message: 'Invalid cron expression "boom"', statusCode: 400 },
        'fallback',
      ),
    ).toBe('Invalid cron expression "boom"');
  });

  it('reads the first entry of a message array', () => {
    expect(
      extractScheduleErrorMessage({ message: ['first', 'second'] }, 'fallback'),
    ).toBe('first');
  });

  it('reads a JSON:API error detail', () => {
    expect(
      extractScheduleErrorMessage(
        { errors: [{ detail: 'Invalid timezone "Mars/Olympus"' }] },
        'fallback',
      ),
    ).toBe('Invalid timezone "Mars/Olympus"');
  });

  it('reads an Error message', () => {
    expect(extractScheduleErrorMessage(new Error('nope'), 'fallback')).toBe(
      'nope',
    );
  });

  it('falls back for unknown shapes', () => {
    expect(extractScheduleErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
