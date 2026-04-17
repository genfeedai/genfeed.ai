import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AgentMemoryCaptureService } from './agent-memory-capture.service';

describe('AgentMemoryCaptureService', () => {
  let service: AgentMemoryCaptureService;
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

  const userId = 'test-object-id'.toHexString();
  const orgId = 'test-object-id'.toHexString();
  const brandId = 'test-object-id'.toHexString();
  const campaignId = 'test-object-id'.toHexString();
  const memoryId = 'test-object-id'.toHexString();
  const contextId = 'test-object-id'.toHexString();

  const mockMemory = { _id: memoryId };

  beforeEach(async () => {
    agentMemoriesService = {
      createMemory: vi.fn().mockResolvedValue(mockMemory),
    };
    contextsService = {
      addEntry: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ _id: contextId }),
      findAll: vi.fn().mockResolvedValue([]),
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
    it('always creates a memory record and returns it', async () => {
      const result = await service.capture(userId, orgId, {
        content: 'This is a test memory',
      });

      expect(agentMemoriesService.createMemory).toHaveBeenCalledWith(
        userId,
        orgId,
        {
          content: 'This is a test memory',
        },
      );
      expect(result.memory).toBe(mockMemory);
    });

    it('passes campaignId through when capturing campaign-scoped memory', async () => {
      await service.capture(userId, orgId, {
        campaignId,
        content: 'Campaign insight',
        scope: 'campaign',
      });

      expect(agentMemoriesService.createMemory).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          campaignId,
          scope: 'campaign',
        }),
      );
    });

    it('does not write brand insight when brandId is absent', async () => {
      await service.capture(userId, orgId, {
        content: 'No brand',
        kind: 'winner',
        scope: 'brand',
      });

      expect(brandMemoryService.addInsight).not.toHaveBeenCalled();
    });

    it('writes brand insight when brandId + scope=brand is provided', async () => {
      await service.capture(userId, orgId, {
        brandId,
        content: 'Winning hook format',
        kind: 'winner',
        scope: 'brand',
        summary: 'Short hooks win',
      });

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
      await service.capture(userId, orgId, {
        brandId,
        content: 'Carousel pattern',
        kind: 'pattern',
        scope: 'global',
      });

      expect(brandMemoryService.addInsight).toHaveBeenCalled();
    });

    it('writes context memory when saveToContextMemory=true', async () => {
      contextsService.findAll.mockResolvedValue([]);

      await service.capture(userId, orgId, {
        brandId,
        content: 'Sample newsletter copy',
        saveToContextMemory: true,
      });

      expect(contextsService.create).toHaveBeenCalled();
      expect(contextsService.addEntry).toHaveBeenCalled();
    });

    it('reuses existing context base when one already exists for the brand', async () => {
      const existingContext = {
        _id: contextId,
        isDeleted: false,
        sourceBrand: brandId,
      };
      contextsService.findAll.mockResolvedValue([existingContext]);

      await service.capture(userId, orgId, {
        brandId,
        content: 'Reuse check',
        kind: 'reference',
        scope: 'brand',
      });

      expect(contextsService.create).not.toHaveBeenCalled();
      expect(contextsService.addEntry).toHaveBeenCalledWith(
        contextId,
        expect.any(Object),
        orgId,
      );
    });

    it('returns wroteBrandInsight=false and wroteContextMemory=false when no qualifying fields', async () => {
      const result = await service.capture(userId, orgId, {
        content: 'Plain memory, no brand',
        kind: 'observation',
        scope: 'global',
      });

      expect(result.wroteBrandInsight).toBe(false);
      expect(result.wroteContextMemory).toBe(false);
    });

    it('normalizes out-of-range confidence scores to [0,1]', async () => {
      await service.capture(userId, orgId, {
        brandId,
        confidence: 1.5,
        content: 'Over-confident memory',
        kind: 'winner',
        scope: 'brand',
        summary: 'Very confident',
      });

      expect(brandMemoryService.addInsight).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({ confidence: 1 }),
      );
    });

    it('uses fallback confidence (0.6) when confidence is undefined', async () => {
      await service.capture(userId, orgId, {
        brandId,
        content: 'No confidence given',
        kind: 'winner',
        scope: 'brand',
        summary: 'Fallback test',
      });

      expect(brandMemoryService.addInsight).toHaveBeenCalledWith(
        orgId,
        brandId,
        expect.objectContaining({ confidence: 0.6 }),
      );
    });

    it('summarizes long content to 220 chars with ellipsis for brand insight', async () => {
      const longContent = 'x'.repeat(300);

      await service.capture(userId, orgId, {
        brandId,
        content: longContent,
        kind: 'winner',
        scope: 'brand',
        // no summary — will derive from content
      });

      const call = brandMemoryService.addInsight.mock.calls[0][2];
      expect(call.insight.length).toBeLessThanOrEqual(220);
      expect(call.insight.endsWith('...')).toBe(true);
    });
  });
});
