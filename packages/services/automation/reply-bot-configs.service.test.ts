import { API_ENDPOINTS } from '@genfeedai/constants';
import { ReplyBotConfigSerializer } from '@genfeedai/serializers';
import { ReplyBotConfig } from '@models/automation/reply-bot-config.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BaseService
const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

const mockFindAll = vi.fn();

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof ReplyBotConfig;
    public Serializer: typeof ReplyBotConfigSerializer;
    public instance = mockInstance;
    public findAll = mockFindAll;

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

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      expect((service as any).endpoint).toBe(API_ENDPOINTS.REPLY_BOT_CONFIGS);
    });

    it('should initialize with provided token', () => {
      expect((service as any).token).toBe(mockToken);
    });
  });

  describe('getInstance', () => {
    it('should return ReplyBotConfigsService instance', () => {
      const instance = ReplyBotConfigsService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('findAllByOrganization', () => {
    it('should call findAll with organization filter', async () => {
      mockFindAll.mockResolvedValue(mockConfigsList);

      await service.findAllByOrganization('org-123');

      expect(mockFindAll).toHaveBeenCalledWith({
        organization: 'org-123',
        pagination: false,
      });
    });

    it('should return array of ReplyBotConfigs', async () => {
      mockFindAll.mockResolvedValue(mockConfigsList);

      const result = await service.findAllByOrganization('org-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findActive', () => {
    it('should call findAll with isActive filter', async () => {
      mockFindAll.mockResolvedValue(mockConfigsList);

      await service.findActive('org-123');

      expect(mockFindAll).toHaveBeenCalledWith({
        isActive: true,
        organization: 'org-123',
        pagination: false,
      });
    });
  });

  describe('toggleActive', () => {
    it('should post to toggle endpoint', async () => {
      mockInstance.post.mockResolvedValue({ data: mockConfigData });

      await service.toggleActive('config-123');

      expect(mockInstance.post).toHaveBeenCalledWith('/config-123/toggle');
    });

    it('should return ReplyBotConfig', async () => {
      mockInstance.post.mockResolvedValue({ data: mockConfigData });

      const result = await service.toggleActive('config-123');

      expect(result).toBeInstanceOf(ReplyBotConfig);
    });
  });

  describe('testReplyGeneration', () => {
    it('should post test data to test endpoint', async () => {
      const mockResponse = { dmText: 'DM text', replyText: 'Generated reply' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      await service.testReplyGeneration(
        'config-123',
        'Test content',
        '@testuser',
      );

      expect(mockInstance.post).toHaveBeenCalledWith('/config-123/test', {
        author: '@testuser',
        content: 'Test content',
      });
    });

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
    it('should post to trigger-polling endpoint', async () => {
      const mockResponse = { jobId: 'job-123' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      await service.triggerPolling('cred-123');

      expect(mockInstance.post).toHaveBeenCalledWith('trigger-polling', {
        credentialId: 'cred-123',
      });
    });

    it('should return jobId', async () => {
      const mockResponse = { jobId: 'job-456' };
      mockInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await service.triggerPolling('cred-123');

      expect(result.jobId).toBe('job-456');
    });
  });

  describe('getQueueStatus', () => {
    it('should get queue status from endpoint', async () => {
      const mockStatus = { active: 2, completed: 100, failed: 3, waiting: 5 };
      mockInstance.get.mockResolvedValue({ data: mockStatus });

      await service.getQueueStatus();

      expect(mockInstance.get).toHaveBeenCalledWith('queue-status');
    });

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

    it('should return updated ReplyBotConfig', async () => {
      mockInstance.post.mockResolvedValue({ data: mockConfigData });

      const result = await service.addMonitoredAccount(
        'config-123',
        'account-456',
      );

      expect(result).toBeInstanceOf(ReplyBotConfig);
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

    it('should return updated ReplyBotConfig', async () => {
      mockInstance.delete.mockResolvedValue({ data: mockConfigData });

      const result = await service.removeMonitoredAccount(
        'config-123',
        'account-456',
      );

      expect(result).toBeInstanceOf(ReplyBotConfig);
    });
  });
});
