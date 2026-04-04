import { API_ENDPOINTS } from '@genfeedai/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.test.com',
  },
}));

vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class MockHTTPBaseService {
    public baseURL: string;
    public token: string;
    public instance = { get: mockGet };

    constructor(baseURL: string, token: string) {
      this.baseURL = baseURL;
      this.token = token;
    }
  },
}));

import { SchedulesService } from '@services/content/schedules.service';

describe('SchedulesService', () => {
  const token = 'schedule-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('constructs with schedule endpoint', () => {
    const service = new SchedulesService(token);
    const state = service as unknown as { baseURL: string; token: string };

    expect(state.baseURL).toBe(
      `https://api.test.com${API_ENDPOINTS.SCHEDULES}`,
    );
    expect(state.token).toBe(token);
  });

  it('maps schedule calendar entries', async () => {
    const now = new Date('2024-01-15T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mockGet.mockResolvedValue({
      data: [
        {
          contentId: 'content-1',
          contentType: 'post',
          createdAt: '2024-01-01T10:00:00Z',
          expectedEngagement: 120,
          id: 'schedule-1',
          platform: 'instagram',
          scheduledAt: '2024-01-20T12:00:00Z',
          schedulingMethod: 'auto',
          status: 'scheduled',
        },
        {
          contentId: 'content-2',
          contentType: 'video',
          expectedEngagement: 80,
          id: 'schedule-2',
          platform: 'tiktok',
          scheduledAt: '2024-01-21T18:00:00Z',
          status: 'scheduled',
        },
      ],
    });

    const service = new SchedulesService(token);
    const result = await service.getCalendar('2024-01-01', '2024-01-31');

    expect(mockGet).toHaveBeenCalledWith('/calendar', {
      params: {
        end: '2024-01-31',
        start: '2024-01-01',
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[0].scheduledAt).toBeInstanceOf(Date);
    expect(result[0].schedulingMethod).toBe('auto');

    expect(result[1].createdAt.getTime()).toBe(now.getTime());
    expect(result[1].scheduledAt).toBeInstanceOf(Date);
    expect(result[1].schedulingMethod).toBe('manual');
  });
});
