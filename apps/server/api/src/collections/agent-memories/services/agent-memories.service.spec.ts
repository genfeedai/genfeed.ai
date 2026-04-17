import {
  AGENT_MEMORY_CONTENT_TYPES,
  AGENT_MEMORY_KINDS,
  AGENT_MEMORY_SCOPES,
  AgentMemory,
} from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentMemoriesService } from './agent-memories.service';

const AGENT_CONN = DB_CONNECTIONS.AGENT;

const makeMemory = (overrides: Record<string, unknown> = {}) => ({
  _id: 'test-object-id',
  brand: null,
  confidence: 0.5,
  content: 'default content',
  contentType: 'generic' as const,
  importance: 0.5,
  kind: 'instruction' as const,
  organization: 'test-object-id',
  scope: 'user' as const,
  tags: [],
  user: 'test-object-id',
  ...overrides,
});

describe('AgentMemoriesService', () => {
  let service: AgentMemoriesService;
  let model: {
    find: ReturnType<typeof vi.fn>;
    findOneAndDelete: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let logger: vi.Mocked<LoggerService>;

  const orgId = 'test-object-id';
  const userId = 'test-object-id';
  const campaignId = 'test-object-id';

  beforeEach(async () => {
    const chainMock = {
      lean: vi.fn().mockResolvedValue([]),
      limit: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    };

    model = {
      create: vi.fn(),
      find: vi.fn().mockReturnValue(chainMock),
      findOneAndDelete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMemoriesService,
        { provide: PrismaService, useValue: model },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentMemoriesService>(AgentMemoriesService);
    logger = module.get(LoggerService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── listForUser ──────────────────────────────────────────────────────────
  describe('listForUser', () => {
    it('returns memories for user+org sorted by createdAt desc', async () => {
      const memories = [makeMemory(), makeMemory()];
      const chainMock = {
        lean: vi.fn().mockResolvedValue(memories),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.listForUser(userId, orgId);

      const filter = model.find.mock.calls[0][0] as {
        organization: string;
        scope: { $ne: string };
        user: string;
      };
      expect(filter.organization).toBe(orgId);
      expect(filter.scope).toEqual({ $ne: 'campaign' });
      expect(filter.user).toBe(userId);
      expect(chainMock.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chainMock.limit).toHaveBeenCalledWith(100);
      expect(result).toEqual(memories);
    });

    it('respects custom limit option', async () => {
      const chainMock = {
        lean: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      await service.listForUser(userId, orgId, { limit: 25 });

      expect(chainMock.limit).toHaveBeenCalledWith(25);
    });
  });

  // ── createMemory ─────────────────────────────────────────────────────────
  describe('createMemory', () => {
    it('creates a memory with normalized fields', async () => {
      const created = makeMemory({ content: 'hello' });
      // BaseService.create wraps model.create internally; stub it
      vi.spyOn(
        service as unknown as { create: (d: unknown) => unknown },
        'create',
      ).mockResolvedValue(created);

      const result = await service.createMemory(userId, orgId, {
        confidence: 0.8,
        content: 'hello',
        importance: 0.9,
        kind: 'winner',
        scope: 'brand',
        tags: ['tag1'],
      });

      expect(result).toEqual(created);
    });

    it('requires campaignId for campaign-scoped memories', async () => {
      await expect(
        service.createMemory(userId, orgId, {
          content: 'shared campaign insight',
          scope: 'campaign',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores campaignId for campaign-scoped memories', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory({ scope: 'campaign' }));

      await service.createMemory(userId, orgId, {
        campaignId,
        content: 'shared campaign insight',
        scope: 'campaign',
      });

      const payload = spy.mock.calls[0][0] as Record<string, string>;
      expect(payload.campaignId).toBe(campaignId);
      expect(payload.scope).toBe('campaign');
    });

    it('normalizes unknown kind to "instruction"', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory());

      await service.createMemory(userId, orgId, {
        content: 'x',
        kind: 'nonsense' as never,
      });

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.kind).toBe('instruction');
    });

    it('normalizes unknown scope to "user"', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory());

      await service.createMemory(userId, orgId, {
        content: 'x',
        scope: 'bogus' as never,
      });

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.scope).toBe('user');
    });

    it('normalizes unknown contentType to "generic"', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory());

      await service.createMemory(userId, orgId, {
        content: 'x',
        contentType: 'invalid' as never,
      });

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.contentType).toBe('generic');
    });

    it('clamps importance to [0,1]', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory());

      await service.createMemory(userId, orgId, {
        content: 'x',
        importance: 999,
      });

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.importance).toBe(1);
    });

    it('uses fallback 0.5 for NaN importance', async () => {
      const spy = vi
        .spyOn(
          service as unknown as { create: (d: unknown) => unknown },
          'create',
        )
        .mockResolvedValue(makeMemory());

      await service.createMemory(userId, orgId, {
        content: 'x',
        importance: NaN,
      });

      const payload = spy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.importance).toBe(0.5);
    });
  });

  describe('getCampaignMemories', () => {
    it('returns campaign-scoped memories for a campaign', async () => {
      const memories = [
        makeMemory({
          campaignId: new string(campaignId),
          scope: 'campaign',
        }),
      ];
      const chainMock = {
        lean: vi.fn().mockResolvedValue(memories),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getCampaignMemories(campaignId, orgId);

      const filter = model.find.mock.calls[0][0] as {
        campaignId: string;
        organization: string;
        scope: string;
      };
      expect(filter.campaignId).toBe(campaignId);
      expect(filter.organization).toBe(orgId);
      expect(filter.scope).toBe('campaign');
      expect(result).toEqual(memories);
    });
  });

  // ── removeMemory ─────────────────────────────────────────────────────────
  describe('removeMemory', () => {
    it('calls findOneAndDelete with correct filter', async () => {
      const memoryId = 'test-object-id';
      model.findOneAndDelete.mockResolvedValue(makeMemory());

      await service.removeMemory(memoryId, userId, orgId);

      const filter = model.findOneAndDelete.mock.calls[0][0] as {
        _id: string;
        organization: string;
        user: string;
      };
      expect(filter._id).toBe(memoryId);
      expect(filter.organization).toBe(orgId);
      expect(filter.user).toBe(userId);
    });

    it('throws NotFoundException when memory not found', async () => {
      model.findOneAndDelete.mockResolvedValue(null);
      const memoryId = 'test-object-id';

      await expect(
        service.removeMemory(memoryId, userId, orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getMemoriesForPrompt ─────────────────────────────────────────────────
  describe('getMemoriesForPrompt', () => {
    it('returns empty array when no memories exist', async () => {
      const chainMock = {
        lean: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getMemoriesForPrompt(userId, orgId);
      expect(result).toEqual([]);
    });

    it('boosts pinned memories to top', async () => {
      const pinnedId = 'test-object-id';
      const unpinnedId = 'test-object-id';

      const memories = [
        makeMemory({ _id: unpinnedId, content: 'unpinned' }),
        makeMemory({ _id: pinnedId, content: 'pinned' }),
      ];

      const chainMock = {
        lean: vi.fn().mockResolvedValue(memories),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getMemoriesForPrompt(userId, orgId, {
        pinnedMemoryIds: [pinnedId],
      });

      expect(result[0].content).toBe('pinned');
    });

    it('filters by query term match', async () => {
      const memories = [
        makeMemory({ content: 'typescript patterns for NestJS' }),
        makeMemory({ content: 'cooking recipes' }),
      ];

      const chainMock = {
        lean: vi.fn().mockResolvedValue(memories),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getMemoriesForPrompt(userId, orgId, {
        limit: 10,
        query: 'nestjs',
      });

      // The NestJS memory should score higher
      expect(result[0].content).toContain('NestJS');
    });

    it('respects limit option', async () => {
      const memories = Array.from({ length: 20 }, (_, i) =>
        makeMemory({ content: `memory ${i}`, importance: 0.9 }),
      );

      const chainMock = {
        lean: vi.fn().mockResolvedValue(memories),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getMemoriesForPrompt(userId, orgId, {
        limit: 3,
      });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('includes campaign memories when campaignId is provided', async () => {
      const chainMock = {
        lean: vi
          .fn()
          .mockResolvedValueOnce([makeMemory({ content: 'user memory' })])
          .mockResolvedValueOnce([
            makeMemory({
              campaignId: new string(campaignId),
              content: 'campaign memory',
              scope: 'campaign',
            }),
          ]),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find.mockReturnValue(chainMock);

      const result = await service.getMemoriesForPrompt(userId, orgId, {
        campaignId,
        limit: 10,
        query: 'campaign',
      });

      expect(result.some((entry) => entry.content === 'campaign memory')).toBe(
        true,
      );
    });
  });

  // ── schema enum constants ────────────────────────────────────────────────
  describe('schema enum constants', () => {
    it('AGENT_MEMORY_KINDS includes instruction and winner', () => {
      expect(AGENT_MEMORY_KINDS).toContain('instruction');
      expect(AGENT_MEMORY_KINDS).toContain('winner');
    });

    it('AGENT_MEMORY_SCOPES includes user, brand, and campaign', () => {
      expect(AGENT_MEMORY_SCOPES).toContain('user');
      expect(AGENT_MEMORY_SCOPES).toContain('brand');
      expect(AGENT_MEMORY_SCOPES).toContain('campaign');
    });

    it('AGENT_MEMORY_CONTENT_TYPES includes generic', () => {
      expect(AGENT_MEMORY_CONTENT_TYPES).toContain('generic');
    });
  });
});
