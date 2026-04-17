import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentMessageRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AgentMessagesService', () => {
  let service: AgentMessagesService;

  interface ChainableMock {
    sort: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
  }

  interface MockModel {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    insertMany: ReturnType<typeof vi.fn>;
  }

  let model: MockModel;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id'.toString();
  const roomId = 'test-object-id'.toString();

  const createChain = (returnValue: unknown): ChainableMock => {
    const chain: ChainableMock = {
      lean: vi.fn().mockResolvedValue(returnValue),
      limit: vi.fn(),
      skip: vi.fn(),
      sort: vi.fn(),
    };
    chain.sort.mockReturnValue(chain);
    chain.skip.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
  };

  beforeEach(async () => {
    const mockModelFn = function (
      this: Record<string, unknown>,
      dto: Record<string, unknown>,
    ) {
      Object.assign(this, dto);
      this.save = vi.fn().mockResolvedValue(dto);
    } as unknown as MockModel;
    mockModelFn.create = vi.fn();
    mockModelFn.find = vi.fn();
    mockModelFn.insertMany = vi.fn().mockResolvedValue(undefined);
    mockModelFn.collection = { name: 'agent-messages' };
    mockModelFn.modelName = 'AgentMessageDoc';
    mockModelFn.findById = vi.fn();
    model = mockModelFn;

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMessagesService,
        { provide: PrismaService, useValue: model },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(AgentMessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addMessage', () => {
    it('should call create with the provided dto', async () => {
      const dto = {
        content: 'hello',
        organization: orgId,
        role: AgentMessageRole.USER,
        room: roomId,
        user: 'test-object-id',
      };

      const result = await service.addMessage(dto);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).content).toBe('hello');
    });

    it('should pass toolCalls and metadata fields through', async () => {
      const dto = {
        metadata: { source: 'workflow' },
        organization: orgId,
        role: AgentMessageRole.ASSISTANT,
        room: roomId,
        toolCalls: [{ status: 'success', toolName: 'generateImage' }],
        user: 'test-object-id',
      };

      const result = await service.addMessage(dto);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).metadata).toEqual(
        dto.metadata,
      );
      expect((result as Record<string, unknown>).toolCalls).toEqual(
        dto.toolCalls,
      );
    });
  });

  describe('getMessagesByRoom', () => {
    it('should return messages for a room with default pagination', async () => {
      const mockMessages = [{ _id: 'test-object-id', content: 'msg1' }];
      const chain = createChain(mockMessages);
      model.find.mockReturnValue(chain);

      const result = await service.getMessagesByRoom(roomId, orgId);

      const filter = model.find.mock.calls[0][0] as {
        isDeleted: boolean;
        organization: string;
        room: string;
      };
      expect(filter.isDeleted).toBe(false);
      expect(filter.organization).toBe(orgId);
      expect(filter.room).toBe(roomId);
      expect(result).toEqual(mockMessages);
    });

    it('should apply custom limit and page', async () => {
      const chain = createChain([]);
      model.find.mockReturnValue(chain);

      await service.getMessagesByRoom(roomId, orgId, { limit: 10, page: 3 });

      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should sort by createdAt descending', async () => {
      const chain = createChain([]);
      model.find.mockReturnValue(chain);

      await service.getMessagesByRoom(roomId, orgId);

      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('getRecentMessages', () => {
    it('should return messages reversed to chronological order', async () => {
      const msg1 = { _id: 'test-object-id', content: 'first' };
      const msg2 = { _id: 'test-object-id', content: 'second' };
      // find returns [second, first] (desc), reversed to [first, second]
      const chain = createChain([msg2, msg1]);
      model.find.mockReturnValue(chain);

      const result = await service.getRecentMessages(roomId, 2);

      expect(result).toEqual([msg1, msg2]);
    });

    it('should use default limit of 20', async () => {
      const chain = createChain([]);
      model.find.mockReturnValue(chain);

      await service.getRecentMessages(roomId);

      expect(chain.limit).toHaveBeenCalledWith(20);
    });

    it('should filter by roomId and isDeleted=false', async () => {
      const chain = createChain([]);
      model.find.mockReturnValue(chain);

      await service.getRecentMessages(roomId);

      const filter = model.find.mock.calls[0][0] as {
        isDeleted: boolean;
        room: string;
      };
      expect(filter.isDeleted).toBe(false);
      expect(filter.room).toBe(roomId);
    });
  });

  describe('copyMessages', () => {
    it('should do nothing if source has no messages', async () => {
      const chain = createChain([]);
      model.find.mockReturnValue(chain);

      await service.copyMessages(roomId, 'target-room', orgId);

      expect(model.insertMany).not.toHaveBeenCalled();
    });

    it('should insert cloned docs with new targetRoomId', async () => {
      const targetRoomId = 'test-object-id'.toString();
      const sourceDoc = {
        _id: 'test-object-id',
        content: 'msg',
        createdAt: new Date('2026-01-01'),
        isDeleted: false,
        organization: orgId,
        role: AgentMessageRole.USER,
        room: new string(roomId),
        updatedAt: new Date('2026-01-01'),
        user: 'user-1',
      };
      const chain = createChain([sourceDoc]);
      model.find.mockReturnValue(chain);

      await service.copyMessages(roomId, targetRoomId, orgId);

      expect(model.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: 'msg',
            isDeleted: false,
            room: expect.any(string),
          }),
        ]),
      );

      const [clones] = (model.insertMany as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(clones[0].room.toString()).toBe(targetRoomId);
    });

    it('should preserve all message fields during copy', async () => {
      const targetRoomId = 'test-object-id'.toString();
      const sourceDoc = {
        _id: 'test-object-id',
        content: 'assistant reply',
        isDeleted: false,
        metadata: { key: 'val' },
        organization: orgId,
        role: AgentMessageRole.ASSISTANT,
        room: new string(roomId),
        toolCalls: [{ status: 'success', toolName: 'search' }],
        user: 'user-1',
      };
      const chain = createChain([sourceDoc]);
      model.find.mockReturnValue(chain);

      await service.copyMessages(roomId, targetRoomId, orgId);

      const [clones] = (model.insertMany as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(clones[0].toolCalls).toEqual(sourceDoc.toolCalls);
      expect(clones[0].metadata).toEqual(sourceDoc.metadata);
    });
  });
});
