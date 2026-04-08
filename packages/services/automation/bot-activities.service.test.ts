import { API_ENDPOINTS } from '@genfeedai/constants';
import type { IBotActivityStats } from '@genfeedai/interfaces';
import { BotActivitySerializer } from '@genfeedai/serializers';
import { BotActivity } from '@models/automation/bot-activity.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BaseService
const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof BotActivity;
    public Serializer: typeof BotActivitySerializer;
    public instance = mockInstance;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof BotActivity,
      Serializer: typeof BotActivitySerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    static getInstance(token: string): MockBaseService {
      return new MockBaseService(
        API_ENDPOINTS.BOT_ACTIVITIES,
        token,
        BotActivity,
        BotActivitySerializer,
      );
    }

    protected extractCollection<T>(data: any): T[] {
      return data.data || [];
    }
  }

  return { BaseService: MockBaseService };
});

import { BotActivitiesService } from '@services/automation/bot-activities.service';

describe('BotActivitiesService', () => {
  const mockToken = 'test-token';
  let service: BotActivitiesService;

  const mockActivitiesData = {
    data: [
      { id: 'activity-1', status: 'completed' },
      { id: 'activity-2', status: 'pending' },
    ],
    meta: { total: 50 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BotActivitiesService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      expect((service as any).endpoint).toBe(API_ENDPOINTS.BOT_ACTIVITIES);
    });

    it('should initialize with provided token', () => {
      expect((service as any).token).toBe(mockToken);
    });
  });

  describe('getInstance', () => {
    it('should return BotActivitiesService instance', () => {
      const instance = BotActivitiesService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('findWithFilters', () => {
    it('should get activities with query params', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      await service.findWithFilters({ organization: 'org-123' });

      expect(mockInstance.get).toHaveBeenCalledWith('', {
        params: { organization: 'org-123' },
      });
    });

    it('should return data and total', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const result = await service.findWithFilters({});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
    });

    it('should support all query params', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const query = {
        fromDate: '2024-01-01',
        limit: 20,
        monitoredAccount: 'account-123',
        organization: 'org-123',
        page: 1,
        replyBotConfig: 'config-123',
        status: 'completed',
        toDate: '2024-12-31',
      };

      await service.findWithFilters(query);

      expect(mockInstance.get).toHaveBeenCalledWith('', { params: query });
    });

    it('should use data length as total when meta.total is missing', async () => {
      mockInstance.get.mockResolvedValue({ data: { data: [{ id: '1' }] } });

      const result = await service.findWithFilters({});

      expect(result.total).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should get stats from summary endpoint', async () => {
      const mockStats: IBotActivityStats = {
        completedActivities: 80,
        failedActivities: 5,
        pendingActivities: 15,
        totalActivities: 100,
      };
      mockInstance.get.mockResolvedValue({ data: mockStats });

      await service.getStats();

      expect(mockInstance.get).toHaveBeenCalledWith('/stats/summary', {
        params: {
          fromDate: undefined,
          replyBotConfig: undefined,
          toDate: undefined,
        },
      });
    });

    it('should pass filters to stats endpoint', async () => {
      mockInstance.get.mockResolvedValue({ data: {} });

      await service.getStats('config-123', '2024-01-01', '2024-12-31');

      expect(mockInstance.get).toHaveBeenCalledWith('/stats/summary', {
        params: {
          fromDate: '2024-01-01',
          replyBotConfig: 'config-123',
          toDate: '2024-12-31',
        },
      });
    });

    it('should return stats data', async () => {
      const mockStats = { totalActivities: 100 };
      mockInstance.get.mockResolvedValue({ data: mockStats });

      const result = await service.getStats();

      expect(result.totalActivities).toBe(100);
    });
  });

  describe('getRecentByConfig', () => {
    it('should get recent activities for config', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      await service.getRecentByConfig('config-123');

      expect(mockInstance.get).toHaveBeenCalledWith('/recent/config-123', {
        params: { limit: 10 },
      });
    });

    it('should use custom limit', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      await service.getRecentByConfig('config-123', 25);

      expect(mockInstance.get).toHaveBeenCalledWith('/recent/config-123', {
        params: { limit: 25 },
      });
    });

    it('should return array of BotActivity', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const result = await service.getRecentByConfig('config-123');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBeInstanceOf(BotActivity);
    });
  });

  describe('findByOrganization', () => {
    it('should call findWithFilters with organization', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const findWithFiltersSpy = vi.spyOn(service, 'findWithFilters');
      await service.findByOrganization('org-123');

      expect(findWithFiltersSpy).toHaveBeenCalledWith({
        organization: 'org-123',
      });
    });

    it('should pass options to findWithFilters', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const findWithFiltersSpy = vi.spyOn(service, 'findWithFilters');
      await service.findByOrganization('org-123', {
        limit: 50,
        page: 2,
        status: 'failed',
      });

      expect(findWithFiltersSpy).toHaveBeenCalledWith({
        limit: 50,
        organization: 'org-123',
        page: 2,
        status: 'failed',
      });
    });
  });

  describe('findByBotConfig', () => {
    it('should call findWithFilters with replyBotConfig', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const findWithFiltersSpy = vi.spyOn(service, 'findWithFilters');
      await service.findByBotConfig('config-123');

      expect(findWithFiltersSpy).toHaveBeenCalledWith({
        replyBotConfig: 'config-123',
      });
    });

    it('should pass options to findWithFilters', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const findWithFiltersSpy = vi.spyOn(service, 'findWithFilters');
      await service.findByBotConfig('config-123', {
        limit: 10,
        page: 1,
        status: 'completed',
      });

      expect(findWithFiltersSpy).toHaveBeenCalledWith({
        limit: 10,
        page: 1,
        replyBotConfig: 'config-123',
        status: 'completed',
      });
    });
  });
});
