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
