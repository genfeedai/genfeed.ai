import { API_ENDPOINTS } from '@genfeedai/constants';
import { MonitoredAccountSerializer } from '@genfeedai/serializers';
import { MonitoredAccount } from '@models/automation/monitored-account.model';
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
    public ModelClass: typeof MonitoredAccount;
    public Serializer: typeof MonitoredAccountSerializer;
    public instance = mockInstance;
    public findAll = mockFindAll;

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
    it('should call findAll with organization filter', async () => {
      mockFindAll.mockResolvedValue(mockAccountsList);

      await service.findAllByOrganization('org-123');

      expect(mockFindAll).toHaveBeenCalledWith({
        organization: 'org-123',
        pagination: false,
      });
    });

    it('should return array of MonitoredAccounts', async () => {
      mockFindAll.mockResolvedValue(mockAccountsList);

      const result = await service.findAllByOrganization('org-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findByBotConfig', () => {
    it('should call findAll with botConfig filter', async () => {
      mockFindAll.mockResolvedValue(mockAccountsList);

      await service.findByBotConfig('config-123');

      expect(mockFindAll).toHaveBeenCalledWith({
        botConfig: 'config-123',
        pagination: false,
      });
    });
  });

  describe('findActive', () => {
    it('should call findAll with isActive filter', async () => {
      mockFindAll.mockResolvedValue(mockAccountsList);

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
      mockInstance.post.mockResolvedValue({ data: mockAccountData });

      await service.toggleActive('account-123');

      expect(mockInstance.post).toHaveBeenCalledWith('/account-123/toggle');
    });

    it('should return MonitoredAccount', async () => {
      mockInstance.post.mockResolvedValue({ data: mockAccountData });

      const result = await service.toggleActive('account-123');

      expect(result).toBeInstanceOf(MonitoredAccount);
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
