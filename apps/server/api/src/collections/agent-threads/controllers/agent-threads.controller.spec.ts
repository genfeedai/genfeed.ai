import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((e: unknown) => {
      throw e;
    }),
  },
}));

describe('AgentThreadsController', () => {
  let controller: AgentThreadsController;
  let service: {
    archiveAllThreads: ReturnType<typeof vi.fn>;
    getUserThreads: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let messagesService: {
    addMessage: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    getMessagesByRoom: ReturnType<typeof vi.fn>;
    getRecentMessages: ReturnType<typeof vi.fn>;
  };
  let scopeService: {
    mutateBrandScope: ReturnType<typeof vi.fn>;
    prepareForTurn: ReturnType<typeof vi.fn>;
  };
  let usersService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'authProvider_123',
    publicMetadata: {
      organization: 'org_current',
      user: 'user_current',
    },
  } as unknown as User;

  beforeEach(() => {
    service = {
      archiveAllThreads: vi.fn(),
      create: vi.fn(),
      findOne: vi.fn(),
      getUserThreads: vi.fn(),
    };
    messagesService = {
      addMessage: vi.fn(),
      findOne: vi.fn(),
      getMessagesByRoom: vi.fn().mockResolvedValue([]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
    };
    scopeService = {
      mutateBrandScope: vi.fn(),
      prepareForTurn: vi.fn().mockResolvedValue({
        initialScopeFields: {
          contextVersion: 1,
          isLegacyBrandFallbackEligible: false,
          scopeChangeProvenance: [],
        },
      }),
    };
    usersService = {
      findOne: vi.fn().mockResolvedValue({
        _id: mockUser.publicMetadata.user,
      }),
    };
    const loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    controller = new AgentThreadsController(
      service as unknown as AgentThreadsService,
      scopeService as unknown as AgentScopeContextService,
      messagesService as unknown as AgentMessagesService,
      usersService as unknown as UsersService,
      loggerService as unknown as LoggerService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listThreads', () => {
    it('should return threads as JSON:API collection', async () => {
      service.getUserThreads.mockResolvedValue([]);
      const result = await controller.listThreads(
        { originalUrl: '/v1/agent/threads' } as never,
        mockUser,
      );
      expect(service.getUserThreads).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          data: [],
          links: expect.objectContaining({
            self: '/v1/agent/threads',
          }),
        }),
      );
    });

    it('should pass undefined status when query is omitted', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser);

      const args = service.getUserThreads.mock.calls[0];
      expect(args[0]).toEqual(expect.any(String));
      expect(args[1]).toEqual(expect.any(String));
      expect(args[2]).toBeUndefined();
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it('should pass explicit status when provided', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser, 'active');

      const args = service.getUserThreads.mock.calls[0];
      expect(args[0]).toEqual(expect.any(String));
      expect(args[1]).toEqual(expect.any(String));
      expect(args[2]).toBe('active');
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it('should trust publicMetadata.user directly with no DB re-lookup (no 401 for authenticated user)', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(service.getUserThreads).toHaveBeenCalledWith(
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        undefined,
      );
    });

    it('should resolve user id from users collection when metadata id is missing', async () => {
      const resolvedUserId = 'user_resolved';
      usersService.findOne.mockResolvedValueOnce({ id: resolvedUserId });
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        {
          ...mockUser,
          publicMetadata: {
            ...mockUser.publicMetadata,
            user: '',
          },
        } as unknown as User,
      );

      expect(usersService.findOne).toHaveBeenCalledTimes(1);
      expect(usersService.findOne).toHaveBeenCalledWith(
        { authProviderId: 'authProvider_123' },
        [],
      );
      expect(service.getUserThreads).toHaveBeenCalledWith(
        resolvedUserId,
        expect.any(String),
        undefined,
      );
    });

    it('should not throw 401 when metadata user id is missing but a legacy _id is found', async () => {
      const resolvedMongoUserId = 'legacy_mongo_id';
      usersService.findOne.mockResolvedValueOnce({ id: resolvedMongoUserId });
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        {
          ...mockUser,
          publicMetadata: {
            ...mockUser.publicMetadata,
            user: '',
          },
        } as unknown as User,
      );

      expect(service.getUserThreads).toHaveBeenCalledWith(
        resolvedMongoUserId,
        expect.any(String),
        undefined,
      );
    });
  });

  describe('getThread', () => {
    it('should get a thread by id', async () => {
      service.findOne.mockResolvedValue({ _id: 'test' });
      await controller.getThread({} as never, 'test-id', mockUser);
      expect(service.findOne).toHaveBeenCalled();
    });
  });

  describe('getMessage', () => {
    it('gets a thread message by id within the current organization', async () => {
      messagesService.findOne.mockResolvedValue({ _id: 'message-id' });

      await controller.getMessage(
        {
          originalUrl: '/v1/agent/threads/thread-id/messages/message-id',
        } as never,
        'thread-id',
        'message-id',
        mockUser,
      );

      expect(messagesService.findOne).toHaveBeenCalledWith({
        _id: 'message-id',
        isDeleted: false,
        organization: 'org_current',
        room: 'thread-id',
      });
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      service.create.mockResolvedValue({ _id: 'new' });
      await controller.createThread({} as never, { title: 'Test' }, mockUser);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_current',
          title: 'Test',
          userId: 'user_current',
        }),
      );
    });
  });

  describe('updateThreadContext', () => {
    it('passes the canonical tenant and user authority to the CAS service', async () => {
      scopeService.mutateBrandScope.mockResolvedValue({
        brandId: 'brand-1',
        contextVersion: 4,
        id: 'thread-1',
      });

      await controller.updateThreadContext(
        {} as never,
        'thread-1',
        { brandId: 'brand-1', expectedContextVersion: 3 },
        mockUser,
      );

      expect(scopeService.mutateBrandScope).toHaveBeenCalledWith({
        brandId: 'brand-1',
        expectedContextVersion: 3,
        organizationId: 'org_current',
        threadId: 'thread-1',
        userId: 'user_current',
      });
    });
  });

  describe('bulkUpdateThreads', () => {
    it('archives all active threads for the current user', async () => {
      service.archiveAllThreads.mockResolvedValue(4);

      await expect(
        controller.bulkUpdateThreads(
          { status: AgentThreadStatus.ARCHIVED },
          mockUser,
        ),
      ).resolves.toEqual({
        archivedCount: 4,
      });

      expect(service.archiveAllThreads).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
    });

    it('rejects a bulk update whose status is not archived', async () => {
      await expect(
        controller.bulkUpdateThreads(
          { status: AgentThreadStatus.ACTIVE },
          mockUser,
        ),
      ).rejects.toThrow();

      expect(service.archiveAllThreads).not.toHaveBeenCalled();
    });
  });
});
