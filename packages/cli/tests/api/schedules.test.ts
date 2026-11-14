import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  patch: (...args: unknown[]) => mockPatch(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the posting windows of one platform and returns the answer as is', async () => {
    const recommendation = { basis: 'default', platform: 'tiktok', windows: [] };
    mockPost.mockResolvedValue(recommendation);

    const { getOptimalTime } = await import('../../src/api/schedules');
    const result = await getOptimalTime('tiktok');

    expect(mockPost).toHaveBeenCalledWith('/schedules/optimal', { platform: 'tiktok' });
    expect(result).toBe(recommendation);
  });

  it('sends the timezone when one is given', async () => {
    mockPost.mockResolvedValue({ basis: 'learned', windows: [] });

    const { getOptimalTime } = await import('../../src/api/schedules');
    const result = await getOptimalTime('tiktok', 'Europe/Malta');

    expect(result).toEqual({ basis: 'learned', windows: [] });

    expect(mockPost).toHaveBeenCalledWith('/schedules/optimal', {
      platform: 'tiktok',
      timezone: 'Europe/Malta',
    });
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
