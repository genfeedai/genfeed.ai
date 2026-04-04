import { computeNextRunAtOrThrow } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { describe, expect, it } from 'vitest';

describe('CronJobsService schedule validation', () => {
  it('should compute next run for valid cron expression', () => {
    const nextRun = computeNextRunAtOrThrow('0 9 * * 1', 'UTC');
    expect(nextRun).toBeInstanceOf(Date);
  });

  it('should throw for invalid cron expression', () => {
    expect(() => computeNextRunAtOrThrow('invalid-cron', 'UTC')).toThrow();
  });
});
