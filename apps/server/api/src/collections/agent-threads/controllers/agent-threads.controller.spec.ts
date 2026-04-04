import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsController } from '@api/collections/agent-threads/controllers/agent-threads.controller';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

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
    getMessagesByRoom: ReturnType<typeof vi.fn>;
    getRecentMessages: ReturnType<typeof vi.fn>;
  };
  let usersService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'clerk_123',
    publicMetadata: {
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
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
      getMessagesByRoom: vi.fn().mockResolvedValue([]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
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
        { originalUrl: '/v1/threads' } as never,
        mockUser,
      );
      expect(service.getUserThreads).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          data: [],
          links: expect.objectContaining({
            self: '/v1/threads',
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
      expect(usersService.findOne).toHaveBeenCalledWith(
        {
          _id: expect.any(String),
          clerkId: 'clerk_123',
        },
        [],
      );
    });

    it('should pass explicit status when provided', async () => {
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads({} as never, mockUser, 'active');

      const args = service.getUserThreads.mock.calls[0];
      expect(args[0]).toEqual(expect.any(String));
      expect(args[1]).toEqual(expect.any(String));
      expect(args[2]).toBe('active');
      expect(usersService.findOne).toHaveBeenCalledWith(
        {
          _id: expect.any(String),
          clerkId: 'clerk_123',
        },
        [],
      );
    });

    it('should resolve mongo user id from users collection when metadata id is invalid', async () => {
      const resolvedMongoUserId = new Types.ObjectId().toString();
      usersService.findOne.mockResolvedValueOnce({ _id: resolvedMongoUserId });
      service.getUserThreads.mockResolvedValue([]);

      await controller.listThreads(
        {} as never,
        {
          ...mockUser,
          publicMetadata: {
            ...mockUser.publicMetadata,
            user: 'invalid-user-id',
          },
        } as unknown as User,
      );

      expect(usersService.findOne).toHaveBeenCalledTimes(1);
      expect(usersService.findOne).toHaveBeenCalledWith(
        { clerkId: 'clerk_123' },
        [],
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

  describe('createThread', () => {
    it('should create a new thread', async () => {
      service.create.mockResolvedValue({ _id: 'new' });
      await controller.createThread({} as never, { title: 'Test' }, mockUser);
      expect(service.create).toHaveBeenCalled();
    });
  });

  describe('archiveAllThreads', () => {
    it('archives all active threads for the current user', async () => {
      service.archiveAllThreads.mockResolvedValue(4);

      await expect(controller.archiveAllThreads(mockUser)).resolves.toEqual({
        archivedCount: 4,
      });

      expect(service.archiveAllThreads).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
      );
    });
  });
});
