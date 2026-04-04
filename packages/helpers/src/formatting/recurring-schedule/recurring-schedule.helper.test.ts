import { formatRecurringSchedule } from '@helpers/formatting/recurring-schedule/recurring-schedule.helper';

describe('formatRecurringSchedule', () => {
  it('formats daily schedules', () => {
    expect(formatRecurringSchedule('0 17 * * *', 'Europe/Malta')).toBe(
      'Every day at 5:00 PM (Europe/Malta)',
    );
  });

  it('formats weekday schedules', () => {
    expect(formatRecurringSchedule('30 9 * * 1-5', 'UTC')).toBe(
      'Every weekday at 9:30 AM (UTC)',
    );
  });

  it('formats weekly schedules', () => {
    expect(formatRecurringSchedule('0 9 * * 1', 'America/New_York')).toBe(
      'Every Monday at 9:00 AM (America/New_York)',
    );
  });

  it('formats monthly schedules', () => {
    expect(formatRecurringSchedule('15 8 1 * *', 'UTC')).toBe(
      'Every month on day 1 at 8:15 AM (UTC)',
    );
  });

  it('includes asset count when provided', () => {
    expect(formatRecurringSchedule('0 17 * * *', 'Europe/Malta', 5)).toBe(
      'Every day at 5:00 PM (Europe/Malta) • 5 assets per run',
    );
  });

  it('falls back to cron text for unsupported patterns', () => {
    expect(formatRecurringSchedule('*/15 * * * *', 'UTC')).toBe(
      '*/15 * * * * (UTC)',
    );
  });
});
