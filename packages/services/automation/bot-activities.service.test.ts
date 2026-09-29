import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IBotActivityStats } from '@genfeedai/contracts/interfaces';
import { BotActivity } from '@genfeedai/models/automation/bot-activity.model';
import { BotActivitySerializer } from '@genfeedai/serializers';
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

    static getDataServiceInstance<T>(
      ServiceClass: new (...args: string[]) => T,
      ...args: string[]
    ): T {
      return new ServiceClass(...args);
    }

    protected extractCollection<T>(data: { data?: T[] }): T[] {
      return data.data ?? [];
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

  describe('getInstance', () => {
    it('should return BotActivitiesService instance', () => {
      const instance = BotActivitiesService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('findWithFilters', () => {
    it('should return data and total', async () => {
      mockInstance.get.mockResolvedValue({ data: mockActivitiesData });

      const result = await service.findWithFilters({});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
    });

    it('should use data length as total when meta.total is missing', async () => {
      mockInstance.get.mockResolvedValue({ data: { data: [{ id: '1' }] } });

      const result = await service.findWithFilters({});

      expect(result.total).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return stats data', async () => {
      const mockStats = { totalActivities: 100 };
      mockInstance.get.mockResolvedValue({ data: mockStats });

      const result = await service.getStats();

      expect(result.totalActivities).toBe(100);
    });
  });

  describe('findByOrganization', () => {
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
        organizationId: 'org-123',
        page: 2,
        status: 'failed',
      });
    });
  });

  describe('findByBotConfig', () => {
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
        replyBotConfigId: 'config-123',
        status: 'completed',
      });
    });
  });
});
