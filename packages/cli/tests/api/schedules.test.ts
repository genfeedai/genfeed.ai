import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
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

  it('bulk schedules items', async () => {
    const items = [
      { contentId: 'content-1', platform: 'instagram', scheduledAt: '2026-08-10T09:00:00Z' },
    ];
    mockPost.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'entry-1', scheduledAt: '2026-08-10T09:00:00Z' }]);

    const { bulkSchedule } = await import('../../src/api/schedules');
    const result = await bulkSchedule(items);

    expect(mockPost).toHaveBeenCalledWith('/schedules/bulk', { items });
    expect(result).toHaveLength(1);
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
});
