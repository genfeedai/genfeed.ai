import { assertValidMergedAgentSchedule } from '@api/collections/brands/utils/brand-agent-schedule-validation.util';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('assertValidMergedAgentSchedule', () => {
  it('skips validation when the update did not touch the schedule', () => {
    expect(() =>
      assertValidMergedAgentSchedule(
        { schedule: { cronExpression: 'not a cron', timezone: 'Nowhere/X' } },
        false,
      ),
    ).not.toThrow();
  });

  it('accepts a valid cron and timezone', () => {
    expect(() =>
      assertValidMergedAgentSchedule(
        {
          schedule: {
            cronExpression: '0 9 * * 1-5',
            timezone: 'Europe/Berlin',
          },
        },
        true,
      ),
    ).not.toThrow();
  });

  it('rejects an unknown timezone', () => {
    expect(() =>
      assertValidMergedAgentSchedule(
        { schedule: { cronExpression: '0 9 * * *', timezone: 'Nowhere/X' } },
        true,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an invalid cron expression', () => {
    expect(() =>
      assertValidMergedAgentSchedule(
        { schedule: { cronExpression: 'not a cron' } },
        true,
      ),
    ).toThrow(/Invalid cron expression/);
  });

  it('accepts a config without a schedule object', () => {
    expect(() => assertValidMergedAgentSchedule({}, true)).not.toThrow();
  });
});
