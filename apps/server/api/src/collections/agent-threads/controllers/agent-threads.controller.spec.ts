import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import type { AgentScopeContextService } from '@api/index';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentThreadStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
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
    getMessagesPage: ReturnType<typeof vi.fn>;
    getRecentMessages: ReturnType<typeof vi.fn>;
    resolveMessageArtifactReferences: ReturnType<typeof vi.fn>;
  };
  let scopeService: {
    mutateBrandScope: ReturnType<typeof vi.fn>;
    prepareForTurn: ReturnType<typeof vi.fn>;
  };
  let usersService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockUserId = testId('user');

  const mockUser = {
    id: mockUserId,
    organizationId: 'org_current',
    userId: mockUserId,
  };

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
      getMessagesPage: vi
        .fn()
        .mockResolvedValue({ docs: [], hasMore: false, nextCursor: null }),
      getRecentMessages: vi.fn().mockResolvedValue([]),
      resolveMessageArtifactReferences: vi.fn().mockResolvedValue([]),
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
        id: mockUser.userId,
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

  it('should have a user-scoped rate limit on createThread', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AgentThreadsController.prototype.createThread,
    );
    expect(metadata).toEqual({
      limit: 30,
      scope: 'user',
      windowMs: 60_000,
    });
  });

  it('should have a user-scoped rate limit on addMessage', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      AgentThreadsController.prototype.addMessage,
    );
    expect(metadata).toEqual({
      limit: 30,
      scope: 'user',
      windowMs: 60_000,
    });
  });

  it('does not rate-limit listThreads', () => {
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_KEY,
        AgentThreadsController.prototype.listThreads,
      ),
    ).toBeUndefined();
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

    it('should trust identity.userId directly with no DB re-lookup (no 401 for authenticated user)', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser);

      expect(usersService.findOne).not.toHaveBeenCalled();
      expect(service.getUserThreads).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        undefined,
        undefined,
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
          ...mockUser,
          userId: '',
        } as unknown as User,
      );

      expect(usersService.findOne).toHaveBeenCalledTimes(1);
      expect(usersService.findOne).toHaveBeenCalledWith({ id: mockUserId }, []);
      expect(service.getUserThreads).toHaveBeenCalledWith(
        resolvedUserId,
        expect.any(String),
        undefined,
        undefined,
        undefined,
      );
    });

    it('should not throw 401 when metadata user id is resolved from the canonical row id', async () => {
      const resolvedUserId = 'resolved_user_id';
      usersService.findOne.mockResolvedValueOnce({ id: resolvedUserId });
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        {
          ...mockUser,
          ...mockUser,
          userId: '',
        } as unknown as User,
      );

      expect(service.getUserThreads).toHaveBeenCalledWith(
        resolvedUserId,
        expect.any(String),
        undefined,
        undefined,
        undefined,
      );
    });

    it('should hard-filter threads by brand when brand query is set', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser, 'active', 'brand-1');

      expect(service.getUserThreads).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        'active',
        'brand-1',
        undefined,
      );
    });

    it('should hard-filter threads by source when source query is set', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        mockUser,
        'active',
        undefined,
        'onboarding',
      );

      expect(service.getUserThreads).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        'active',
        undefined,
        'onboarding',
      );
    });

    it('should ignore a blank source query', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        mockUser,
        'active',
        undefined,
        '   ',
      );

      expect(service.getUserThreads).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.organizationId,
        'active',
        undefined,
        undefined,
      );
    });
  });

  describe('getThread', () => {
    it('should get a thread by id', async () => {
      service.findOne.mockResolvedValue({ id: 'test' });
      await controller.getThread({} as never, 'test-id', mockUser);
      expect(service.findOne).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('forwards the cursor and computed limit to getMessagesPage, org-scoped', async () => {
      messagesService.getMessagesPage.mockResolvedValue({
        docs: [],
        hasMore: false,
        nextCursor: null,
      });

      await controller.getMessages(
        { originalUrl: '/v1/agent/threads/thread-1/messages' } as never,
        'thread-1',
        mockUser,
        '25',
        'opaque-cursor',
      );

      expect(messagesService.getMessagesPage).toHaveBeenCalledWith(
        'thread-1',
        'org_current',
        { cursor: 'opaque-cursor', limit: 25 },
      );
    });

    it('defaults the limit to 50 and passes no cursor when the query omits them', async () => {
      messagesService.getMessagesPage.mockResolvedValue({
        docs: [],
        hasMore: false,
        nextCursor: null,
      });

      await controller.getMessages(
        {} as never,
        'thread-1',
        mockUser,
        undefined,
        undefined,
      );

      expect(messagesService.getMessagesPage).toHaveBeenCalledWith(
        'thread-1',
        'org_current',
        { cursor: undefined, limit: 50 },
      );
    });

    it('reverses the newest-first service page into chronological order', async () => {
      messagesService.getMessagesPage.mockResolvedValue({
        docs: [
          { id: 'msg-3', content: 'third' },
          { id: 'msg-2', content: 'second' },
          { id: 'msg-1', content: 'first' },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const result = await controller.getMessages(
        { originalUrl: '/v1/agent/threads/thread-1/messages' } as never,
        'thread-1',
        mockUser,
      );

      expect(
        (result as { data: Array<{ id: string }> }).data.map((d) => d.id),
      ).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('surfaces hasMore and nextCursor via links.cursor', async () => {
      messagesService.getMessagesPage.mockResolvedValue({
        docs: [],
        hasMore: true,
        nextCursor: 'next-opaque-cursor',
      });

      const result = await controller.getMessages(
        { originalUrl: '/v1/agent/threads/thread-1/messages' } as never,
        'thread-1',
        mockUser,
      );

      expect(result).toEqual(
        expect.objectContaining({
          links: expect.objectContaining({
            cursor: {
              hasMore: true,
              limit: 50,
              nextCursor: 'next-opaque-cursor',
            },
          }),
        }),
      );
    });
  });

  describe('getMessage', () => {
    it('gets a thread message by id within the current organization', async () => {
      messagesService.findOne.mockResolvedValue({ id: 'message-id' });

      await controller.getMessage(
        {
          originalUrl: '/v1/agent/threads/thread-id/messages/message-id',
        } as never,
        'thread-id',
        'message-id',
        mockUser,
      );

      expect(messagesService.findOne).toHaveBeenCalledWith({
        id: 'message-id',
        organizationId: 'org_current',
        threadId: 'thread-id',
      });
    });
  });

  describe('resolveMessageArtifactReferences', () => {
    it('resolves references through the organization-scoped message seam', async () => {
      const resolved = [
        {
          reference: {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org_current',
            recordId: 'post-1',
            serializer: 'post',
          },
          serialized: { id: 'post-1' },
          source: 'canonical',
        },
      ];
      messagesService.resolveMessageArtifactReferences.mockResolvedValue(
        resolved,
      );

      await expect(
        controller.resolveMessageArtifactReferences(
          'thread-id',
          'message-id',
          mockUser,
        ),
      ).resolves.toEqual({ data: resolved });

      expect(
        messagesService.resolveMessageArtifactReferences,
      ).toHaveBeenCalledWith('thread-id', 'message-id', 'org_current', {
        client: 'api',
        deployment: 'server',
      });
    });
  });

  describe('createThread', () => {
    it('should create a new thread', async () => {
      service.create.mockResolvedValue({ id: 'new' });
      await controller.createThread({} as never, { title: 'Test' }, mockUser);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_current',
          title: 'Test',
          userId: mockUserId,
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
        userId: mockUserId,
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
        mockUserId,
        'org_current',
        undefined,
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
