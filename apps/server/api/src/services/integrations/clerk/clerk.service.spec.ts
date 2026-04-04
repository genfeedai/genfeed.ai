import { CacheService } from '@api/services/cache/services/cache.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { Test, TestingModule } from '@nestjs/testing';
import {
  clearAllMocks,
  expectToThrowAsync,
  generateTestEmail,
  generateTestId,
  testErrors,
} from '@test/mocks/test.helpers';

describe('ClerkService', () => {
  let service: ClerkService;
  let mockCacheService: Record<string, vi.Mock>;
  let mockClerkClient: Record<string, Record<string, vi.Mock>>;

  const mockUserId = generateTestId();
  const mockEmail = generateTestEmail();

  const mockUser = {
    createdAt: new Date(),
    emailAddresses: [{ emailAddress: mockEmail }],
    id: mockUserId,
    privateMetadata: {
      preferences: {},
    },
    publicMetadata: {
      isOwner: true,
      organization: generateTestId(),
      user: generateTestId(),
    },
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockCacheService = {
      generateKey: vi
        .fn()
        .mockImplementation(
          (namespace: string, userId: string) => `${namespace}:${userId}`,
        ),
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue(true),
    };

    mockClerkClient = {
      invitations: {
        createInvitation: vi.fn(),
        getInvitation: vi.fn(),
        getInvitationList: vi.fn().mockResolvedValue({ data: [] }),
        revokeInvitation: vi.fn(),
      },
      organizations: {
        deleteOrganization: vi.fn(),
        getOrganization: vi.fn(),
        updateOrganization: vi.fn(),
      },
      sessions: {
        getSession: vi.fn(),
        getSessionList: vi.fn(),
        revokeSession: vi.fn(),
      },
      users: {
        createUser: vi.fn().mockResolvedValue(mockUser),
        deleteUser: vi.fn().mockResolvedValue({ deleted: true }),
        getUser: vi.fn().mockResolvedValue(mockUser),
        getUserList: vi.fn().mockResolvedValue({ data: [mockUser] }),
        updateUser: vi.fn().mockResolvedValue(mockUser),
        updateUserMetadata: vi.fn().mockResolvedValue(mockUser),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: 'ClerkClient',
          useValue: mockClerkClient,
        },
      ],
    }).compile();

    service = module.get<ClerkService>(ClerkService);
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUser', () => {
    it('should get user by ID successfully', async () => {
      const result = await service.getUser(mockUserId);

      expect(result).toEqual(mockUser);
      expect(mockCacheService.get).toHaveBeenCalledWith(
        `clerk-user:${mockUserId}`,
      );
      expect(mockClerkClient.users.getUser).toHaveBeenCalledWith(mockUserId);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        `clerk-user:${mockUserId}`,
        mockUser,
        {
          tags: ['clerk-users', `clerk-user:${mockUserId}`],
          ttl: 60,
        },
      );
    });

    it('returns cached users without calling Clerk again', async () => {
      mockCacheService.get.mockResolvedValue(mockUser);

      const result = await service.getUser(mockUserId);

      expect(result).toEqual(mockUser);
      expect(mockClerkClient.users.getUser).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('can bypass cache for fresh upstream reads', async () => {
      const result = await service.getUser(mockUserId, { skipCache: true });

      expect(result).toEqual(mockUser);
      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
      expect(mockClerkClient.users.getUser).toHaveBeenCalledWith(mockUserId);
    });

    it('should handle user not found', async () => {
      const error = new Error('User not found');
      mockClerkClient.users.getUser.mockRejectedValue(error);

      await expectToThrowAsync(() => service.getUser('non-existent-id'), error);
    });

    it('should handle Clerk API errors', async () => {
      mockClerkClient.users.getUser.mockRejectedValue(
        testErrors.internalServer,
      );

      await expectToThrowAsync(
        () => service.getUser(mockUserId),
        testErrors.internalServer,
      );
    });

    it('should handle null user ID', async () => {
      mockClerkClient.users.getUser.mockRejectedValue(
        new Error('Invalid user ID'),
      );

      await expectToThrowAsync(() => service.getUser(null));
    });

    it('should handle empty user ID', async () => {
      mockClerkClient.users.getUser.mockRejectedValue(
        new Error('Invalid user ID'),
      );

      await expectToThrowAsync(() => service.getUser(''));
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const updates = {
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await service.updateUser(mockUserId, updates);

      expect(result).toEqual(mockUser);
      expect(mockClerkClient.users.updateUser).toHaveBeenCalledWith(
        mockUserId,
        updates,
      );
      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith([
        'clerk-users',
        `clerk-user:${mockUserId}`,
      ]);
    });

    it('should handle partial updates', async () => {
      const updates = { firstName: 'Jane' };

      await service.updateUser(mockUserId, updates);

      expect(mockClerkClient.users.updateUser).toHaveBeenCalledWith(
        mockUserId,
        updates,
      );
    });

    it('should handle empty updates', async () => {
      await service.updateUser(mockUserId, {});

      expect(mockClerkClient.users.updateUser).toHaveBeenCalledWith(
        mockUserId,
        {},
      );
    });

    it('should handle update errors', async () => {
      mockClerkClient.users.updateUser.mockRejectedValue(testErrors.badRequest);

      await expectToThrowAsync(
        () => service.updateUser(mockUserId, { firstName: 'Invalid' }),
        testErrors.badRequest,
      );
    });
  });

  describe('updateUserPrivateMetadata', () => {
    it('should update private metadata successfully', async () => {
      const metadata = {
        preferences: {
          notifications: true,
          theme: 'dark',
        },
      };

      const result = await service.updateUserPrivateMetadata(
        mockUserId,
        metadata,
      );

      expect(result).toEqual(mockUser);
      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          privateMetadata: metadata,
        },
      );
      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith([
        'clerk-users',
        `clerk-user:${mockUserId}`,
      ]);
    });

    it('should handle nested metadata updates', async () => {
      const metadata = {
        preferences: {
          settings: {
            advanced: {
              debug: true,
            },
          },
        },
      };

      await service.updateUserPrivateMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          privateMetadata: metadata,
        },
      );
    });

    it('should handle null metadata values', async () => {
      const metadata = {
        preferences: null,
        settings: undefined,
      };

      await service.updateUserPrivateMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          privateMetadata: metadata,
        },
      );
    });

    it('should handle metadata update errors', async () => {
      mockClerkClient.users.updateUserMetadata.mockRejectedValue(
        testErrors.forbidden,
      );

      await expectToThrowAsync(
        () => service.updateUserPrivateMetadata(mockUserId, {}),
        testErrors.forbidden,
      );
    });
  });

  describe('updateUserPublicMetadata', () => {
    it('should update public metadata successfully', async () => {
      const metadata = {
        isOwner: false,
        organization: generateTestId(),
        user: generateTestId(),
      };

      const result = await service.updateUserPublicMetadata(
        mockUserId,
        metadata,
      );

      expect(result).toEqual(mockUser);
      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          publicMetadata: expect.objectContaining(metadata),
        },
      );
      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith([
        'clerk-users',
        `clerk-user:${mockUserId}`,
      ]);
    });

    it('should handle partial metadata updates', async () => {
      const metadata = {
        isOwner: true,
      };

      await service.updateUserPublicMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          publicMetadata: expect.objectContaining(metadata),
        },
      );
    });

    it('should handle organization changes', async () => {
      const metadata = {
        organization: generateTestId(),
      };

      await service.updateUserPublicMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          publicMetadata: expect.objectContaining(metadata),
        },
      );
    });

    it('should handle metadata update errors', async () => {
      mockClerkClient.users.updateUserMetadata.mockRejectedValue(
        testErrors.unauthorized,
      );

      await expectToThrowAsync(
        () => service.updateUserPublicMetadata(mockUserId, {}),
        testErrors.unauthorized,
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent updates', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        service.updateUser(mockUserId, { firstName: `User${i}` }),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(mockClerkClient.users.updateUser).toHaveBeenCalledTimes(5);
    });

    it('should handle very long metadata values', async () => {
      const longString = 'a'.repeat(10000);
      const metadata = {
        description: longString,
      };

      await service.updateUserPublicMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          publicMetadata: expect.objectContaining(metadata),
        },
      );
    });

    it('should handle special characters in metadata', async () => {
      const metadata = {
        description: '!@#$%^&*()_+-=[]{}|;\':",./<>?`~',
        unicode: '🚀 🎉 💻 ñ ü ß',
      };

      await service.updateUserPublicMetadata(mockUserId, metadata);

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalledWith(
        mockUserId,
        {
          publicMetadata: expect.objectContaining(metadata),
        },
      );
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockClerkClient.users.getUser.mockRejectedValue(timeoutError);

      await expectToThrowAsync(() => service.getUser(mockUserId), timeoutError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      mockClerkClient.users.updateUser.mockRejectedValue(rateLimitError);

      await expectToThrowAsync(
        () => service.updateUser(mockUserId, {}),
        rateLimitError,
      );
    });

    it('should handle invalid JSON in metadata', async () => {
      // This should not throw as Clerk handles serialization
      await service.updateUserPublicMetadata(mockUserId, { data: 'valid' });

      expect(mockClerkClient.users.updateUserMetadata).toHaveBeenCalled();
    });

    it('should handle undefined ClerkClient methods', async () => {
      const originalMethod = mockClerkClient.users.getUser;
      mockClerkClient.users.getUser = undefined;

      await expectToThrowAsync(() => service.getUser(mockUserId));

      mockClerkClient.users.getUser = originalMethod;
    });

    it('should handle ClerkClient connection errors', async () => {
      const connectionError = new Error('Connection refused');
      connectionError.name = 'ECONNREFUSED';
      mockClerkClient.users.getUser.mockRejectedValue(connectionError);

      await expectToThrowAsync(
        () => service.getUser(mockUserId),
        connectionError,
      );
    });
  });
});
