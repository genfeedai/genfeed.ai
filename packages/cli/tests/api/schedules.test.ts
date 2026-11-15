import { beforeEach, describe, expect, it, vi } from 'vitest';

type Request = { body?: unknown; method: 'GET' | 'PATCH' | 'POST'; path: string };

const requests: Request[] = [];
let response: unknown;

vi.mock('../../src/api/client', () => ({
  get: async (path: string) => {
    requests.push({ method: 'GET', path });
    return response;
  },
  patch: async (path: string, body: unknown) => {
    requests.push({ body, method: 'PATCH', path });
    return response;
  },
  post: async (path: string, body: unknown) => {
    requests.push({ body, method: 'POST', path });
    return response;
  },
}));

vi.mock('../../src/api/json-api', () => ({
  flattenSingle: (document: { data: unknown }) => document.data,
}));

describe('api/schedules', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it('asks for the posting windows of one platform and returns the answer as is', async () => {
    const recommendation = { basis: 'default', platform: 'tiktok', windows: [] };
    response = recommendation;

    const { getOptimalTime } = await import('../../src/api/schedules');
    const result = await getOptimalTime('tiktok');

    expect(result).toBe(recommendation);
    expect(requests).toEqual([
      { body: { platform: 'tiktok' }, method: 'POST', path: '/schedules/optimal' },
    ]);
  });

  it('sends the timezone when one is given', async () => {
    response = { basis: 'learned', windows: [] };

    const { getOptimalTime } = await import('../../src/api/schedules');
    const result = await getOptimalTime('tiktok', 'Europe/Malta');

    expect(result).toEqual({ basis: 'learned', windows: [] });
    expect(requests).toEqual([
      {
        body: { platform: 'tiktok', timezone: 'Europe/Malta' },
        method: 'POST',
        path: '/schedules/optimal',
      },
    ]);
  });

  it('reads a scheduled release from the canonical post-group route', async () => {
    const release = { id: 'release/1', status: 'scheduled' };
    response = { data: release };

    const { getScheduledRelease } = await import('../../src/api/schedules');
    const result = await getScheduledRelease('release/1');

    expect(result).toEqual(release);
    expect(requests).toEqual([{ method: 'GET', path: '/post-groups/release%2F1' }]);
  });

  it('cancels a scheduled release through the canonical lifecycle action', async () => {
    const release = { id: 'release-1', status: 'cancelled' };
    response = { data: release };

    const { cancelScheduledRelease } = await import('../../src/api/schedules');
    const result = await cancelScheduledRelease('release-1');

    expect(result).toEqual(release);
    expect(requests).toEqual([
      { body: { action: 'cancel' }, method: 'PATCH', path: '/post-groups/release-1' },
    ]);
  });

  it('reschedules through the canonical scheduledDate update field', async () => {
    const release = {
      id: 'release-1',
      scheduledAt: '2026-09-01T10:00:00.000Z',
      status: 'scheduled',
    };
    response = { data: release };

    const { rescheduleScheduledRelease } = await import('../../src/api/schedules');
    const result = await rescheduleScheduledRelease('release-1', '2026-09-01T10:00:00.000Z');

    expect(result).toEqual(release);
    expect(requests).toEqual([
      {
        body: { scheduledDate: '2026-09-01T10:00:00.000Z' },
        method: 'PATCH',
        path: '/post-groups/release-1',
      },
    ]);
  });
});
