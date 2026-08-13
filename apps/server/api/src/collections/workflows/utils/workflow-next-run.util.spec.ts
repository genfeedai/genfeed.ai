import { withNextRunAt } from '@api/collections/workflows/utils/workflow-next-run.util';
import { describe, expect, it } from 'vitest';

describe('withNextRunAt', () => {
  it('derives the next fire instant from cron + timezone for an enabled schedule', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: true,
      schedule: '0 9 * * *',
      timezone: 'Europe/Paris',
    });

    expect(decorated.nextRunAt).not.toBeNull();
    const nextRun = new Date(decorated.nextRunAt as string);
    expect(nextRun.getTime()).toBeGreaterThan(Date.now());
  });

  it('defaults the timezone to UTC when absent', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: true,
      schedule: '30 12 * * 1-5',
      timezone: null,
    });

    expect(decorated.nextRunAt).not.toBeNull();
  });

  it('returns null for a disabled schedule', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: false,
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });

    expect(decorated.nextRunAt).toBeNull();
  });

  it('returns null when no schedule is set', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: true,
      schedule: null,
    });

    expect(decorated.nextRunAt).toBeNull();
  });

  it('returns null instead of throwing for an unparsable stored cron', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: true,
      schedule: 'not a cron',
      timezone: 'UTC',
    });

    expect(decorated.nextRunAt).toBeNull();
  });

  it('preserves the original workflow fields', () => {
    const decorated = withNextRunAt({
      isScheduleEnabled: true,
      label: 'Morning digest',
      schedule: '0 9 * * *',
      timezone: 'UTC',
    });

    expect(decorated.label).toBe('Morning digest');
    expect(decorated.schedule).toBe('0 9 * * *');
  });
});
