import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ReplyBotConfig } from '@genfeedai/models/automation/reply-bot-config.model';
import { ReplyBotConfigSerializer } from '@genfeedai/serializers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BaseService
const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

const mockFindAllPages = vi.fn();

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof ReplyBotConfig;
    public Serializer: typeof ReplyBotConfigSerializer;
    public instance = mockInstance;
    public findAllPages = mockFindAllPages;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof ReplyBotConfig,
      Serializer: typeof ReplyBotConfigSerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    static getInstance(token: string): MockBaseService {
      return new MockBaseService(
        API_ENDPOINTS.REPLY_BOT_CONFIGS,
        token,
        ReplyBotConfig,
        ReplyBotConfigSerializer,
      );
    }

    static getDataServiceInstance(ServiceClass: any, ...args: any[]) {
      return new ServiceClass(...args);
    }

    protected extractResource(data: any): any {
      return data.data || data;
    }
  }

  return { BaseService: MockBaseService };
});

import { ReplyBotConfigsService } from '@services/automation/reply-bot-configs.service';

describe('ReplyBotConfigsService', () => {
  const mockToken = 'test-token';
  let service: ReplyBotConfigsService;

  const mockConfigData = {
    data: {
      id: 'config-123',
      isActive: true,
      name: 'Test Bot',
    },
  };

  const mockConfigsList = [
    { id: 'config-1', isActive: true, name: 'Bot 1' },
    { id: 'config-2', isActive: false, name: 'Bot 2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReplyBotConfigsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return ReplyBotConfigsService instance', () => {
      const instance = ReplyBotConfigsService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('findAllByOrganization', () => {
    it('should return array of ReplyBotConfigs', async () => {
      mockFindAllPages.mockResolvedValue(mockConfigsList);

      const result = await service.findAllByOrganization('org-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findActive', () => {
    it('should call findAllPages with isActive filter', async () => {
      mockFindAllPages.mockResolvedValue(mockConfigsList);

      await service.findActive('org-123');

      expect(mockFindAllPages).toHaveBeenCalledWith({
        isActive: true,
        organizationId: 'org-123',
      });
    });
  });

  describe('testReplyGeneration', () => {
    it('should return reply and dm text', async () => {
      const mockResponse = { dmText: 'DM', replyText: 'Reply' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await service.testReplyGeneration(
        'config-123',
        'Content',
        'Author',
      );

      expect(result.replyText).toBe('Reply');
      expect(result.dmText).toBe('DM');
    });

    it('should work without dmText', async () => {
      const mockResponse = { replyText: 'Reply only' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await service.testReplyGeneration(
        'config-123',
        'Content',
        'Author',
      );

      expect(result.replyText).toBe('Reply only');
      expect(result.dmText).toBeUndefined();
    });
  });

  describe('triggerPolling', () => {
    it('should return jobId', async () => {
      const mockResponse = { jobId: 'job-456' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await service.triggerPolling('cred-123');

      expect(result.jobId).toBe('job-456');
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', async () => {
      const mockStatus = { active: 2, completed: 100, failed: 3, waiting: 5 };
      mockInstance.get.mockResolvedValue({ data: mockStatus });

      const result = await service.getQueueStatus();

      expect(result.waiting).toBe(5);
      expect(result.active).toBe(2);
      expect(result.completed).toBe(100);
      expect(result.failed).toBe(3);
    });
  });

  describe('addMonitoredAccount', () => {
    it('should post to monitored-accounts endpoint', async () => {
      mockInstance.post.mockResolvedValue({ data: mockConfigData });

      await service.addMonitoredAccount('config-123', 'account-456');

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/config-123/monitored-accounts',
        { accountId: 'account-456' },
      );
    });
  });

  describe('removeMonitoredAccount', () => {
    it('should delete from monitored-accounts endpoint', async () => {
      mockInstance.delete.mockResolvedValue({ data: mockConfigData });

      await service.removeMonitoredAccount('config-123', 'account-456');

      expect(mockInstance.delete).toHaveBeenCalledWith(
        '/config-123/monitored-accounts/account-456',
      );
    });
  });
});
