import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleCommand } from '../../src/commands/schedule';

const {
  mockBulkSchedule,
  mockCancelScheduledRelease,
  mockConfirm,
  mockGetActiveBrand,
  mockGetScheduledRelease,
  mockHandleError,
  mockPrint,
  mockPrintJson,
  mockRequireAuth,
  mockRescheduleScheduledRelease,
} = vi.hoisted(() => ({
  mockBulkSchedule: vi.fn(),
  mockCancelScheduledRelease: vi.fn(),
  mockConfirm: vi.fn(),
  mockGetActiveBrand: vi.fn(),
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
  bulkSchedule: (brandId: string, items: unknown) => mockBulkSchedule(brandId, items),
  cancelScheduledRelease: (releaseId: string) => mockCancelScheduledRelease(releaseId),
  getCalendar: vi.fn(),
  getOptimalTimes: vi.fn(),
  getScheduledRelease: (releaseId: string) => mockGetScheduledRelease(releaseId),
  rescheduleScheduledRelease: (releaseId: string, scheduledDate: string) =>
    mockRescheduleScheduledRelease(releaseId, scheduledDate),
}));

vi.mock('../../src/config/store', () => ({
  getActiveBrand: () => mockGetActiveBrand(),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: (value?: unknown) => mockPrint(value),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/errors')>()),
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

  describe('bulk', () => {
    const items = [
      { contentId: 'c1', platform: 'linkedin', scheduledAt: '2026-09-02T09:00:00Z' },
      { contentId: 'c2', platform: 'twitter', scheduledAt: '2026-09-02T10:00:00Z' },
    ];
    const run = (...extra: string[]) =>
      scheduleCommand.parseAsync(['bulk', '--items', JSON.stringify(items), '--json', ...extra], {
        from: 'user',
      });

    beforeEach(() => {
      mockGetActiveBrand.mockResolvedValue('brand-active');
      mockBulkSchedule.mockResolvedValue({
        failed: [{ contentId: 'c2', reason: 'Not found' }],
        scheduled: [{ id: 's1', scheduledAt: '2026-09-02T09:00:00Z' }],
      });
    });

    it('schedules for the selected brand and prints scheduled and failed items', async () => {
      await run('--brand', 'brand-flag');

      expect(mockBulkSchedule).toHaveBeenCalledWith('brand-flag', items);
      expect(mockPrintJson).toHaveBeenCalledWith({
        failed: [{ contentId: 'c2', reason: 'Not found' }],
        scheduled: [{ id: 's1', scheduledAt: '2026-09-02T09:00:00Z' }],
      });
    });

    it('rejects items that are not a list of contentId, platform and scheduledAt', async () => {
      await expect(
        scheduleCommand.parseAsync(['bulk', '--items', '[{"contentId":"c1"}]'], { from: 'user' })
      ).rejects.toThrow('needs a contentId, a platform and a scheduledAt');
      await expect(
        scheduleCommand.parseAsync(
          ['bulk', '--items', '[{"contentId":"c1","platform":"x","scheduledAt":"not a date"}]'],
          { from: 'user' }
        )
      ).rejects.toThrow('is not a date');
      await expect(
        scheduleCommand.parseAsync(
          [
            'bulk',
            '--items',
            '[{"contentId":"c1","platform":"x","scheduledAt":"2026-09-02T09:00:00Z"},{"contentId":"c1","platform":"x","scheduledAt":"2026-09-02T10:00:00Z"}]',
          ],
          { from: 'user' }
        )
      ).rejects.toThrow('lists c1 twice for x');
      expect(mockBulkSchedule).not.toHaveBeenCalled();
    });
  });
});
