import { LlmVendorCostLedgerService } from '@api/services/integrations/llm/llm-vendor-cost-ledger.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LlmVendorCostLedgerService', () => {
  const llmVendorCost = {
    create: vi.fn(),
    groupBy: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: LlmVendorCostLedgerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    llmVendorCost.create.mockResolvedValue({ id: 'cost-1' });
    llmVendorCost.groupBy.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmVendorCostLedgerService,
        { provide: PrismaService, useValue: { llmVendorCost } },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(LlmVendorCostLedgerService);
  });

  it('persists a tenant-scoped ledger row without prompt or completion content', async () => {
    await service.record({
      brandId: 'brand-1',
      completionTokens: 5,
      isByok: false,
      latencyMs: 40,
      model: 'deepseek/deepseek-v4-flash-0731',
      organizationId: 'org-1',
      promptTokens: 10,
      provider: 'openrouter',
      runId: 'run-1',
      threadId: 'thread-1',
      vendorCostMicros: 180,
    });

    expect(llmVendorCost.create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        completionTokens: 5,
        isByok: false,
        isDeleted: false,
        latencyMs: 40,
        model: 'deepseek/deepseek-v4-flash-0731',
        organizationId: 'org-1',
        promptTokens: 10,
        provider: 'openrouter',
        runId: 'run-1',
        threadId: 'thread-1',
        vendorCostMicros: 180,
      },
    });
    const payload = llmVendorCost.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(payload.data)).toEqual(
      expect.arrayContaining([
        'completionTokens',
        'brandId',
        'isByok',
        'isDeleted',
        'latencyMs',
        'model',
        'organizationId',
        'promptTokens',
        'provider',
        'runId',
        'threadId',
        'vendorCostMicros',
      ]),
    );
    expect(payload.data).not.toHaveProperty('content');
    expect(payload.data).not.toHaveProperty('messages');
    expect(payload.data).not.toHaveProperty('prompt');
    expect(payload.data).not.toHaveProperty('completion');
  });

  it('queries vendor cost per org/model over a date range with tenant filters', async () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-14T00:00:00.000Z');
    llmVendorCost.groupBy.mockResolvedValue([
      {
        _count: { _all: 2 },
        _sum: {
          completionTokens: 10,
          promptTokens: 20,
          vendorCostMicros: 180,
        },
        isByok: false,
        model: 'deepseek/deepseek-v4-flash-0731',
        provider: 'openrouter',
      },
    ]);

    const result = await service.aggregateByOrgModel({
      from,
      organizationId: 'org-1',
      to,
    });

    expect(llmVendorCost.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: {
        completionTokens: true,
        promptTokens: true,
        vendorCostMicros: true,
      },
      by: ['model', 'provider', 'isByok'],
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(result).toEqual([
      {
        byokCallCount: 0,
        callCount: 2,
        completionTokens: 10,
        model: 'deepseek/deepseek-v4-flash-0731',
        platformCallCount: 2,
        promptTokens: 20,
        provider: 'openrouter',
        vendorCostMicros: 180,
      },
    ]);
  });
});
