import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AgentMemoryCaptureService } from './agent-memory-capture.service';

describe('AgentMemoryCaptureService', () => {
  let service: AgentMemoryCaptureService;
  let embeddingWriter: { assertCaptureAuthority: ReturnType<typeof vi.fn> };
  let agentMemoriesService: {
    createMemory: ReturnType<typeof vi.fn>;
  };
  let contextsService: {
    addEntry: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
  };
  let brandMemoryService: {
    addInsight: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const userId = 'test-object-id';
  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const campaignId = 'test-object-id';
  const memoryId = 'test-object-id';
  const contextId = 'test-object-id';

  const captureAuthority = {
    origin: 'ACTOR' as const,
    actor: { userId, organizationId: orgId, isApiKey: false, scopes: [] },
  };
  const mockMemory = { id: memoryId };

  beforeEach(async () => {
    embeddingWriter = {
      assertCaptureAuthority: vi.fn().mockResolvedValue(undefined),
    };
    agentMemoriesService = {
      createMemory: vi.fn().mockResolvedValue(mockMemory),
    };
    contextsService = {
      addEntry: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: contextId }),
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };
    brandMemoryService = {
      addInsight: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMemoryCaptureService,
        { provide: ContextEmbeddingWriteService, useValue: embeddingWriter },
        { provide: AgentMemoriesService, useValue: agentMemoriesService },
        { provide: ContextsService, useValue: contextsService },
        { provide: BrandMemoryService, useValue: brandMemoryService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<AgentMemoryCaptureService>(AgentMemoryCaptureService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('capture', () => {
    it('rejects revoked capture authority before every memory, insight and context effect', async () => {
      embeddingWriter.assertCaptureAuthority.mockRejectedValue(
        new Error('Revoked actor'),
      );
      await expect(
        service.capture(
          userId,
          orgId,
          {
            brandId,
            content: 'Private',
            saveToContextMemory: true,
            scope: KnowledgeMemoryScope.BRAND,
          },
          captureAuthority,
        ),
      ).rejects.toThrow('Revoked actor');
      expect(agentMemoriesService.createMemory).not.toHaveBeenCalled();
      expect(brandMemoryService.addInsight).not.toHaveBeenCalled();
      expect(contextsService.create).not.toHaveBeenCalled();
      expect(contextsService.addEntry).not.toHaveBeenCalled();
    });

    it('always creates a memory record and returns it', async () => {
      const result = await service.capture(
        userId,
        orgId,
        {
          content: 'This is a test memory',
        },
        captureAuthority,
      );

      expect(agentMemoriesService.createMemory).toHaveBeenCalledWith(
        userId,
        orgId,
        {
          content: 'This is a test memory',
        },
      );
      expect(result.memory).toBe(mockMemory);
    });

    it('passes campaignId through when capturing brand-scoped campaign memory', async () => {
      await service.capture(
        userId,
        orgId,
        {
          brandId,
          campaignId,
          content: 'Campaign insight',
          scope: KnowledgeMemoryScope.BRAND,
        },
        captureAuthority,
      );

      expect(agentMemoriesService.createMemory).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          brandId,
          campaignId,
          scope: KnowledgeMemoryScope.BRAND,
        }),
      );
    });

    it('does not write brand insight when brandId is absent', async () => {
      await service.capture(
        userId,
        orgId,
        {
          content: 'No brand',
          kind: 'winner',
          scope: KnowledgeMemoryScope.BRAND,
        },
        captureAuthority,
      );

      expect(brandMemoryService.addInsight).not.toHaveBeenCalled();
    });

    it('writes brand insight when brandId + scope=brand is provided', async () => {
      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: 'Winning hook format',
          kind: 'winner',
          scope: KnowledgeMemoryScope.BRAND,
          summary: 'Short hooks win',
        },
        captureAuthority,
      );

      expect(brandMemoryService.addInsight).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({
          category: 'winner',
          insight: 'Short hooks win',
        }),
      );
    });

    it('writes brand insight when kind=pattern even without scope=brand', async () => {
      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: 'Carousel pattern',
          kind: 'pattern',
          scope: KnowledgeMemoryScope.PERSONAL,
        },
        captureAuthority,
      );

      expect(brandMemoryService.addInsight).toHaveBeenCalled();
    });

    it('writes context memory when saveToContextMemory=true', async () => {
      contextsService.findAll.mockResolvedValue({ docs: [] });

      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: 'Sample newsletter copy',
          saveToContextMemory: true,
        },
        captureAuthority,
      );

      expect(contextsService.create).toHaveBeenCalled();
      expect(contextsService.addEntry).toHaveBeenCalledWith(
        contextId,
        expect.any(Object),
        orgId,
        undefined,
        {
          origin: 'ACTOR',
          actor: captureAuthority.actor,
          sourceMemoryId: memoryId,
        },
      );
    });

    it('reuses existing context base when one already exists for the brand', async () => {
      const existingContext = {
        id: contextId,
        isDeleted: false,
        sourceBrandId: brandId,
      };
      contextsService.findAll.mockResolvedValue({ docs: [existingContext] });

      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: 'Reuse check',
          kind: 'reference',
          scope: KnowledgeMemoryScope.BRAND,
        },
        captureAuthority,
      );

      expect(contextsService.findAll).toHaveBeenCalledWith(
        orgId,
        { category: 'content_library', isActive: true, sourceBrandId: brandId },
        { limit: 1, page: 1 },
      );
      expect(contextsService.create).not.toHaveBeenCalled();
      expect(contextsService.addEntry).toHaveBeenCalledWith(
        contextId,
        expect.any(Object),
        orgId,
        undefined,
        {
          origin: 'ACTOR',
          actor: captureAuthority.actor,
          sourceMemoryId: memoryId,
        },
      );
    });

    it('returns wroteBrandInsight=false and wroteContextMemory=false when no qualifying fields', async () => {
      const result = await service.capture(
        userId,
        orgId,
        {
          content: 'Plain memory, no brand',
          kind: 'preference',
          scope: KnowledgeMemoryScope.PERSONAL,
        },
        captureAuthority,
      );

      expect(result.wroteBrandInsight).toBe(false);
      expect(result.wroteContextMemory).toBe(false);
    });

    it('normalizes out-of-range confidence scores to [0,1]', async () => {
      await service.capture(
        userId,
        orgId,
        {
          brandId,
          confidence: 1.5,
          content: 'Over-confident memory',
          kind: 'winner',
          scope: KnowledgeMemoryScope.BRAND,
          summary: 'Very confident',
        },
        captureAuthority,
      );

      expect(brandMemoryService.addInsight).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({ confidence: 1 }),
      );
    });

    it('uses fallback confidence (0.6) when confidence is undefined', async () => {
      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: 'No confidence given',
          kind: 'winner',
          scope: KnowledgeMemoryScope.BRAND,
          summary: 'Fallback test',
        },
        captureAuthority,
      );

      expect(brandMemoryService.addInsight).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({ confidence: 0.6 }),
      );
    });

    it('summarizes long content to 220 chars with ellipsis for brand insight', async () => {
      const longContent = 'x'.repeat(300);

      await service.capture(
        userId,
        orgId,
        {
          brandId,
          content: longContent,
          kind: 'winner',
          scope: KnowledgeMemoryScope.BRAND,
          // no summary — will derive from content
        },
        captureAuthority,
      );

      const call = brandMemoryService.addInsight.mock.calls[0][2];
      expect(call.insight.length).toBeLessThanOrEqual(220);
      expect(call.insight.endsWith('...')).toBe(true);
    });
  });
});
