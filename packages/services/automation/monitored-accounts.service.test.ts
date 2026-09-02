import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { MonitoredAccount } from '@genfeedai/models/automation/monitored-account.model';
import { MonitoredAccountSerializer } from '@genfeedai/serializers';
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
    public ModelClass: typeof MonitoredAccount;
    public Serializer: typeof MonitoredAccountSerializer;
    public instance = mockInstance;
    public findAllPages = mockFindAllPages;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof MonitoredAccount,
      Serializer: typeof MonitoredAccountSerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    static getInstance(token: string): MockBaseService {
      return new MockBaseService(
        API_ENDPOINTS.MONITORED_ACCOUNTS,
        token,
        MonitoredAccount,
        MonitoredAccountSerializer,
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

import { MonitoredAccountsService } from '@services/automation/monitored-accounts.service';

describe('MonitoredAccountsService', () => {
  const mockToken = 'test-token';
  let service: MonitoredAccountsService;

  const mockAccountData = {
    data: {
      id: 'account-123',
      isActive: true,
      username: 'testuser',
    },
  };

  const mockAccountsList = [
    { id: 'account-1', isActive: true, username: 'user1' },
    { id: 'account-2', isActive: false, username: 'user2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MonitoredAccountsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      expect((service as any).endpoint).toBe(API_ENDPOINTS.MONITORED_ACCOUNTS);
    });

    it('should initialize with provided token', () => {
      expect((service as any).token).toBe(mockToken);
    });
  });

  describe('getInstance', () => {
    it('should return MonitoredAccountsService instance', () => {
      const instance = MonitoredAccountsService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('findAllByOrganization', () => {
    it('should call findAllPages with organization filter', async () => {
      mockFindAllPages.mockResolvedValue(mockAccountsList);

      await service.findAllByOrganization('org-123');

      expect(mockFindAllPages).toHaveBeenCalledWith({
        organizationId: 'org-123',
      });
    });

    it('should return array of MonitoredAccounts', async () => {
      mockFindAllPages.mockResolvedValue(mockAccountsList);

      const result = await service.findAllByOrganization('org-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findByBotConfig', () => {
    it('should call findAllPages with botConfig filter', async () => {
      mockFindAllPages.mockResolvedValue(mockAccountsList);

      await service.findByBotConfig('config-123');

      expect(mockFindAllPages).toHaveBeenCalledWith({
        botConfigId: 'config-123',
      });
    });
  });

  describe('findActive', () => {
    it('should call findAllPages with isActive filter', async () => {
      mockFindAllPages.mockResolvedValue(mockAccountsList);

      await service.findActive('org-123');

      expect(mockFindAllPages).toHaveBeenCalledWith({
        isActive: true,
        organizationId: 'org-123',
      });
    });
  });

  describe('validateTwitterUsername', () => {
    it('should post to validate endpoint', async () => {
      const mockValidation = {
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Test bio',
        displayName: 'Test User',
        followersCount: 1000,
        id: '123456',
        username: 'testuser',
        valid: true,
      };
      mockInstance.post.mockResolvedValue({ data: mockValidation });

      await service.validateTwitterUsername('testuser');

      expect(mockInstance.post).toHaveBeenCalledWith('validate', {
        username: 'testuser',
      });
    });

    it('should return validation result for valid user', async () => {
      const mockValidation = {
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'A test user',
        displayName: 'Test User',
        followersCount: 5000,
        id: '123456',
        username: 'testuser',
        valid: true,
      };
      mockInstance.post.mockResolvedValue({ data: mockValidation });

      const result = await service.validateTwitterUsername('testuser');

      expect(result.valid).toBe(true);
      expect(result.id).toBe('123456');
      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('Test User');
      expect(result.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(result.followersCount).toBe(5000);
      expect(result.bio).toBe('A test user');
    });

    it('should return validation result for invalid user', async () => {
      const mockValidation = {
        valid: false,
      };
      mockInstance.post.mockResolvedValue({ data: mockValidation });

      const result = await service.validateTwitterUsername('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.id).toBeUndefined();
      expect(result.username).toBeUndefined();
    });
  });
});
