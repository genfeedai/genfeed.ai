import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  patch: (...args: unknown[]) => mockPatch(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the calendar without a date range', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'entry-1', scheduledAt: '2026-08-10T09:00:00Z' }]);

    const { getCalendar } = await import('../../src/api/schedules');
    const result = await getCalendar();

    expect(mockGet).toHaveBeenCalledWith('/schedules/calendar');
    expect(result[0].id).toBe('entry-1');
  });

  it('fetches the calendar with a start and end range', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { getCalendar } = await import('../../src/api/schedules');
    await getCalendar('2026-08-01', '2026-08-31');

    expect(mockGet).toHaveBeenCalledWith('/schedules/calendar?start=2026-08-01&end=2026-08-31');
  });

  describe('bulkSchedule', () => {
    const item = (contentId: string, platform: string, scheduledAt: string) => ({
      contentId,
      platform,
      scheduledAt,
    });

    it('sends each platform as a custom-strategy request keyed by content id', async () => {
      mockPost
        .mockResolvedValueOnce({ failed: [], scheduled: [{ id: 's1', scheduledAt: 'a' }] })
        .mockResolvedValueOnce({
          failed: [{ contentId: 'c3', reason: 'Not found' }],
          scheduled: [{ id: 's2', scheduledAt: 'b' }],
        });

      const { bulkSchedule } = await import('../../src/api/schedules');
      const result = await bulkSchedule('brand-1', [
        item('c1', 'linkedin', '2026-09-02T09:00:00Z'),
        item('c2', 'twitter', '2026-09-02T10:00:00Z'),
        item('c3', 'linkedin', '2026-09-02T11:00:00Z'),
      ]);

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost).toHaveBeenNthCalledWith(1, '/schedules/bulk', {
        brandIds: ['brand-1'],
        contentIds: ['c1', 'c3'],
        customTimes: { c1: '2026-09-02T09:00:00Z', c3: '2026-09-02T11:00:00Z' },
        platforms: ['linkedin'],
        schedulingStrategy: 'custom',
      });
      expect(mockPost).toHaveBeenNthCalledWith(2, '/schedules/bulk', {
        brandIds: ['brand-1'],
        contentIds: ['c2'],
        customTimes: { c2: '2026-09-02T10:00:00Z' },
        platforms: ['twitter'],
        schedulingStrategy: 'custom',
      });
      expect(result.scheduled.map((entry) => entry.id)).toEqual(['s1', 's2']);
      expect(result.failed).toEqual([{ contentId: 'c3', reason: 'Not found' }]);
      expect(mockFlattenCollection).not.toHaveBeenCalled();
    });

    it('splits a platform into batches of 100 content ids', async () => {
      mockPost.mockResolvedValue({ failed: [], scheduled: [{ id: 's', scheduledAt: 'a' }] });
      const items = Array.from({ length: 101 }, (_, index) =>
        item(`c${index}`, 'twitter', '2026-09-02T09:00:00Z')
      );

      const { bulkSchedule } = await import('../../src/api/schedules');
      await bulkSchedule('brand-1', items);

      expect(mockPost.mock.calls.map(([, body]) => body.contentIds.length)).toEqual([100, 1]);
    });

    it('reports a failed batch against its content ids when another batch succeeded', async () => {
      mockPost
        .mockResolvedValueOnce({ failed: [], scheduled: [{ id: 's1', scheduledAt: 'a' }] })
        .mockRejectedValueOnce(new Error('Rate limited'));

      const { bulkSchedule } = await import('../../src/api/schedules');
      const result = await bulkSchedule('brand-1', [
        item('c1', 'linkedin', '2026-09-02T09:00:00Z'),
        item('c2', 'twitter', '2026-09-02T10:00:00Z'),
      ]);

      expect(result.scheduled).toHaveLength(1);
      expect(result.failed).toEqual([{ contentId: 'c2', reason: 'Rate limited' }]);
    });

    it('throws the first error when nothing could be scheduled', async () => {
      mockPost.mockRejectedValue(new Error('Invalid or expired API key'));

      const { bulkSchedule } = await import('../../src/api/schedules');

      await expect(
        bulkSchedule('brand-1', [item('c1', 'linkedin', '2026-09-02T09:00:00Z')])
      ).rejects.toThrow('Invalid or expired API key');
    });
  });

  it('fetches optimal times without filters', async () => {
    mockPost.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { getOptimalTimes } = await import('../../src/api/schedules');
    await getOptimalTimes();

    expect(mockPost).toHaveBeenCalledWith('/schedules/optimal', {});
  });

  it('fetches optimal times with platform and timezone', async () => {
    mockPost.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([
      { day: 'tuesday', hour: 17, platform: 'tiktok', score: 88, timezone: 'UTC' },
    ]);

    const { getOptimalTimes } = await import('../../src/api/schedules');
    const result = await getOptimalTimes('tiktok', 'UTC');

    expect(mockPost).toHaveBeenCalledWith('/schedules/optimal', {
      platform: 'tiktok',
      timezone: 'UTC',
    });
    expect(result[0].score).toBe(88);
  });

  it('reads a scheduled release from the canonical post-group route', async () => {
    const release = { id: 'release/1', status: 'scheduled' };
    mockGet.mockResolvedValue({ data: {} });
    mockFlattenSingle.mockReturnValue(release);

    const { getScheduledRelease } = await import('../../src/api/schedules');
    const result = await getScheduledRelease('release/1');

    expect(mockGet).toHaveBeenCalledWith('/post-groups/release%2F1');
    expect(mockFlattenSingle).toHaveBeenCalledWith({ data: {} });
    expect(result).toBe(release);
  });

  it('cancels a scheduled release through the canonical lifecycle action', async () => {
    const release = { id: 'release-1', status: 'cancelled' };
    mockPatch.mockResolvedValue({ data: {} });
    mockFlattenSingle.mockReturnValue(release);

    const { cancelScheduledRelease } = await import('../../src/api/schedules');
    const result = await cancelScheduledRelease('release-1');

    expect(mockPatch).toHaveBeenCalledWith('/post-groups/release-1', {
      action: 'cancel',
    });
    expect(result).toBe(release);
  });

  it('reschedules through the canonical scheduledDate update field', async () => {
    const release = {
      id: 'release-1',
      scheduledAt: '2026-09-01T10:00:00.000Z',
      status: 'scheduled',
    };
    mockPatch.mockResolvedValue({ data: {} });
    mockFlattenSingle.mockReturnValue(release);

    const { rescheduleScheduledRelease } = await import('../../src/api/schedules');
    const result = await rescheduleScheduledRelease('release-1', '2026-09-01T10:00:00.000Z');

    expect(mockPatch).toHaveBeenCalledWith('/post-groups/release-1', {
      scheduledDate: '2026-09-01T10:00:00.000Z',
    });
    expect(result).toBe(release);
  });
});
