import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { PersonaContentFormat } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentProductionWorkflowService', () => {
  const brandsService = { findForOrganization: vi.fn() };
  const contentPlannerService = { generatePlan: vi.fn() };
  const contentExecutionService = { executePlan: vi.fn() };
  const contentReviewService = { autoApproveIfEligible: vi.fn() };
  const prisma = {
    contentSchedule: { findFirst: vi.fn() },
    persona: { findMany: vi.fn(), update: vi.fn() },
  };
  const contentPipelineQueueService = { queueGenerateAndPublish: vi.fn() };
  const contentSchedulesService = {
    calculateNextRunAt: vi.fn(),
    markScheduleRan: vi.fn(),
  };
  const contentGatewayService = { routeSignal: vi.fn() };
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
      plan: { _id: 'plan-1' },
    });
    contentExecutionService.executePlan.mockResolvedValue({
      results: [{ contentDraftId: 'draft-1' }],
      summary: { completed: 1, total: 1 },
    });
    contentReviewService.autoApproveIfEligible.mockResolvedValue(undefined);
    prisma.persona.findMany.mockResolvedValue([]);
    prisma.persona.update.mockResolvedValue({});
    prisma.contentSchedule.findFirst.mockResolvedValue(null);
    contentPipelineQueueService.queueGenerateAndPublish.mockResolvedValue(
      'job-1',
    );
    contentGatewayService.routeSignal.mockResolvedValue({
      drafts: [],
      runs: ['run-1'],
    });
    contentSchedulesService.calculateNextRunAt.mockReturnValue(
      new Date('2026-06-24T09:05:00.000Z'),
    );
    contentSchedulesService.markScheduleRan.mockResolvedValue(undefined);

    service = new ContentProductionWorkflowService(
      brandsService as never,
      contentPlannerService as never,
      contentExecutionService as never,
      contentReviewService as never,
      prisma as never,
      contentPipelineQueueService as never,
      contentSchedulesService as never,
      contentGatewayService as never,
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
    expect(contentReviewService.autoApproveIfEligible).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'draft-1',
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

  it('skips disabled content schedules without routing a signal', async () => {
    prisma.contentSchedule.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      cronExpression: '* * * * *',
      id: 'schedule-1',
      isEnabled: false,
      nextRunAt: new Date('2026-06-24T08:59:00.000Z'),
      organizationId: 'org-1',
      skillParams: {},
      skillSlugs: [],
      timezone: 'UTC',
    });

    const result = await service.runContentSchedule('org-1', 'schedule-1');

    expect(contentGatewayService.routeSignal).not.toHaveBeenCalled();
    expect(contentSchedulesService.markScheduleRan).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'contentScheduleRun',
      reason: 'content_schedule_disabled',
      status: 'skipped',
    });
  });

  it('routes due content schedules and advances nextRunAt', async () => {
    const nextRunAt = new Date('2026-06-24T09:05:00.000Z');
    prisma.contentSchedule.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      cronExpression: '*/5 * * * *',
      id: 'schedule-1',
      isEnabled: true,
      nextRunAt: new Date('2026-06-24T08:55:00.000Z'),
      organizationId: 'org-1',
      skillParams: { topic: 'launch' },
      skillSlugs: ['daily-post'],
      timezone: 'Europe/Malta',
    });
    contentSchedulesService.calculateNextRunAt.mockReturnValue(nextRunAt);

    const result = await service.runContentSchedule(
      'org-1',
      'schedule-1',
      'workflow-1',
    );

    expect(contentGatewayService.routeSignal).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      payload: {
        scheduleId: 'schedule-1',
        skillParams: { topic: 'launch' },
        skillSlugs: ['daily-post'],
        workflowId: 'workflow-1',
      },
      type: 'cron',
    });
    expect(contentSchedulesService.calculateNextRunAt).toHaveBeenCalledWith(
      '*/5 * * * *',
      'Europe/Malta',
      new Date('2026-06-24T09:00:00.000Z'),
    );
    expect(contentSchedulesService.markScheduleRan).toHaveBeenCalledWith(
      'schedule-1',
      'org-1',
      nextRunAt,
      new Date('2026-06-24T09:00:00.000Z'),
    );
    expect(result).toMatchObject({
      action: 'contentScheduleRun',
      organizationId: 'org-1',
      processed: 1,
      skipped: 0,
      status: 'completed',
    });
  });
});
