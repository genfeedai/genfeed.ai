import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleCommand } from '../../src/commands/schedule';

const {
  mockCancelScheduledRelease,
  mockConfirm,
  mockGetOptimalTime,
  mockGetScheduledRelease,
  mockHandleError,
  mockPrint,
  mockPrintJson,
  mockRequireAuth,
  mockRescheduleScheduledRelease,
} = vi.hoisted(() => ({
  mockCancelScheduledRelease: vi.fn(),
  mockConfirm: vi.fn(),
  mockGetOptimalTime: vi.fn(),
  mockGetScheduledRelease: vi.fn(),
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockPrint: vi.fn(),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRescheduleScheduledRelease: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: (options: unknown) => mockConfirm(options),
}));

vi.mock('ora', () => {
  const spinner = {
    fail: vi.fn(),
    start: () => spinner,
    stop: vi.fn(),
    succeed: vi.fn(),
  };
  return { default: () => spinner };
});

vi.mock('../../src/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/api/schedules', () => ({
  bulkSchedule: vi.fn(),
  cancelScheduledRelease: (releaseId: string) => mockCancelScheduledRelease(releaseId),
  getCalendar: vi.fn(),
  getOptimalTime: (platform: string, timezone?: string) => mockGetOptimalTime(platform, timezone),
  getScheduledRelease: (releaseId: string) => mockGetScheduledRelease(releaseId),
  rescheduleScheduledRelease: (releaseId: string, scheduledDate: string) =>
    mockRescheduleScheduledRelease(releaseId, scheduledDate),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: (value?: unknown) => mockPrint(value),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors', () => ({
  handleError: (error: unknown) => mockHandleError(error),
}));

const release = {
  id: 'release-1',
  scheduledAt: '2026-09-01T10:00:00.000Z',
  status: 'scheduled',
  targets: [],
  timezone: 'Europe/Malta',
  title: 'Launch',
};

describe('schedule lifecycle commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('gf_test_auth');
    mockConfirm.mockResolvedValue(true);
    mockGetScheduledRelease.mockResolvedValue(release);
    mockCancelScheduledRelease.mockResolvedValue({
      ...release,
      status: 'cancelled',
    });
    mockRescheduleScheduledRelease.mockResolvedValue(release);
  });

  it('reads a canonical scheduled release status', async () => {
    await scheduleCommand.parseAsync(['status', 'release-1', '--json'], {
      from: 'user',
    });

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockGetScheduledRelease).toHaveBeenCalledWith('release-1');
    expect(mockPrintJson).toHaveBeenCalledWith(release);
  });

  it('cancels a scheduled release with force mode', async () => {
    await scheduleCommand.parseAsync(['cancel', 'release-1', '--force', '--json'], {
      from: 'user',
    });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockCancelScheduledRelease).toHaveBeenCalledWith('release-1');
    expect(mockPrintJson).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  it('does not cancel when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false);

    await scheduleCommand.parseAsync(['cancel', 'release-1'], {
      from: 'user',
    });

    expect(mockCancelScheduledRelease).not.toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalledWith('Cancellation aborted');
  });

  it('reschedules a release with the canonical scheduledDate field', async () => {
    await scheduleCommand.parseAsync(
      ['reschedule', 'release-1', '--scheduled-at', '2026-09-01T10:00:00.000Z', '--json'],
      { from: 'user' }
    );

    expect(mockRescheduleScheduledRelease).toHaveBeenCalledWith(
      'release-1',
      '2026-09-01T10:00:00.000Z'
    );
    expect(mockPrintJson).toHaveBeenCalledWith(release);
  });

  describe('optimal', () => {
    const recommendation = {
      basis: 'learned',
      eligibleCount: 24,
      method: 'median-by-slot',
      metric: 'engagementRate',
      platform: 'twitter',
      reasoning: ['Ranked by median engagement rate per 3-hour slot.'],
      spanDays: 84,
      timezone: 'Europe/Malta',
      windows: [
        { endHour: 21, median: 0.0345, sampleCount: 12, startHour: 18, weekday: 3 },
        { endHour: 15, median: 0.021, sampleCount: 12, startHour: 12, weekday: 0 },
      ],
    };
    const args = ['optimal', '--platform', 'twitter', '--timezone', 'Europe/Malta'];

    it('prints learned windows with their weekday, median and sample count', async () => {
      mockGetOptimalTime.mockResolvedValue(recommendation);

      await scheduleCommand.parseAsync(args, { from: 'user' });

      expect(mockGetOptimalTime).toHaveBeenCalledWith('twitter', 'Europe/Malta');
      const lines = mockPrint.mock.calls.map(([line]) => String(line));
      expect(lines).toContainEqual(expect.stringContaining('Learned from your posts for twitter'));
      expect(lines).toContainEqual(
        expect.stringContaining('Thu       18:00-21:00  median 0.0345 from 12 posts')
      );
      expect(lines).toContainEqual(
        expect.stringContaining('Mon       12:00-15:00  median 0.0210 from 12 posts')
      );
      expect(lines).toContainEqual(expect.stringContaining('Ranked by median engagement rate'));
    });

    it('labels default times as defaults and omits the sample columns', async () => {
      mockGetOptimalTime.mockResolvedValue({
        ...recommendation,
        basis: 'default',
        method: 'platform-default',
        reasoning: ['Default times for twitter, not learned from your posts.'],
        windows: [{ endHour: 10, median: null, sampleCount: null, startHour: 8, weekday: null }],
      });

      await scheduleCommand.parseAsync(args, { from: 'user' });

      const lines = mockPrint.mock.calls.map(([line]) => String(line));
      expect(lines).toContainEqual(expect.stringContaining('Default times for twitter'));
      expect(lines).toContainEqual('  Every day 08:00-10:00');
      expect(lines).toContainEqual(expect.stringContaining('not learned from your posts'));
    });

    it('prints the recommendation as JSON', async () => {
      mockGetOptimalTime.mockResolvedValue(recommendation);

      await scheduleCommand.parseAsync([...args, '--json'], { from: 'user' });

      expect(mockPrintJson).toHaveBeenCalledWith(recommendation);
    });
  });
});
