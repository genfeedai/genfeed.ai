import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { PersonaContentFormat } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentProductionWorkflowService', () => {
  const brandsService = { findForOrganization: vi.fn() };
  const contentPlannerService = { generatePlan: vi.fn() };
  const contentExecutionService = { executePlan: vi.fn() };
  const prisma = {
    persona: { findMany: vi.fn(), update: vi.fn() },
  };
  const contentPipelineQueueService = { queueGenerateAndPublish: vi.fn() };
  const cacheService = { acquireLock: vi.fn(), releaseLock: vi.fn() };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: ContentProductionWorkflowService;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T09:00:00.000Z'));
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    brandsService.findForOrganization.mockResolvedValue([]);
    contentPlannerService.generatePlan.mockResolvedValue({
      items: [{}],
      plan: { id: 'plan-1' },
    });
    contentExecutionService.executePlan.mockResolvedValue({
      results: [{ postId: 'post-1' }],
      summary: { completed: 1, total: 1 },
    });
    prisma.persona.findMany.mockResolvedValue([]);
    prisma.persona.update.mockResolvedValue({});
    contentPipelineQueueService.queueGenerateAndPublish.mockResolvedValue(
      'job-1',
    );

    service = new ContentProductionWorkflowService(
      brandsService as never,
      contentPlannerService as never,
      contentExecutionService as never,
      prisma as never,
      contentPipelineQueueService as never,
      cacheService as never,
      logger as never,
    );
  });

  it('runs content engine only for eligible brands in the workflow organization', async () => {
    brandsService.findForOrganization.mockResolvedValue([
      {
        _id: 'brand-1',
        agentConfig: {
          autoPublish: { enabled: true },
          strategy: {
            contentTypes: ['post'],
            goals: ['launch'],
            platforms: ['instagram'],
          },
        },
        id: 'brand-1',
        isActive: true,
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        _id: 'brand-2',
        agentConfig: {
          autoPublish: { enabled: false },
          strategy: { contentTypes: ['post'] },
        },
        id: 'brand-2',
        isActive: true,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.runContentEngineProduction('org-1');

    expect(brandsService.findForOrganization).toHaveBeenCalledWith('org-1');
    expect(contentPlannerService.generatePlan).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'user-1',
      expect.objectContaining({
        itemCount: 5,
        platforms: ['instagram'],
        topics: ['launch'],
      }),
    );
    expect(contentExecutionService.executePlan).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'plan-1',
      'user-1',
    );
    expect(result).toMatchObject({
      action: 'contentEngineProduction',
      failed: 0,
      organizationId: 'org-1',
      processed: 1,
      skipped: 1,
      status: 'completed',
    });
  });

  it('queues due autopilot personas with per-org query guards and idempotency', async () => {
    prisma.persona.findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        config: {
          contentStrategy: {
            formats: [PersonaContentFormat.VIDEO],
            frequency: 'daily',
            platforms: ['instagram'],
            topics: ['launch'],
          },
          profileImageUrl: 'https://example.test/avatar.png',
        },
        credentials: [{ id: 'credential-1' }],
        id: 'persona-1',
        label: 'Ada',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.runContentPipelineAutopilot('org-1');

    expect(prisma.persona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { credentials: true },
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(
      contentPipelineQueueService.queueGenerateAndPublish,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        idempotencyKey: 'autopilot:persona-1:2026-06-24T09',
        organizationId: 'org-1',
        personaId: 'persona-1',
        platforms: ['instagram'],
        userId: 'user-1',
      }),
    );
    expect(prisma.persona.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'persona-1' },
      }),
    );
    expect(result).toMatchObject({
      action: 'contentPipelineAutopilot',
      organizationId: 'org-1',
      processed: 1,
      skipped: 0,
      status: 'completed',
    });
  });
});
