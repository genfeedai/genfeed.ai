import { CampaignOrchestrationWorkflowService } from '@api/collections/workflows/services/campaign-orchestration-workflow.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('CampaignOrchestrationWorkflowService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const prisma = {
    agentCampaign: {
      findMany: vi.fn(),
    },
  };
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
  const campaignMemoryQueueService = { queueExtraction: vi.fn() };
  const orchestratorQueueService = { queueCampaignRun: vi.fn() };
  const triggerEvaluatorQueueService = { queueCampaignEvaluation: vi.fn() };

  let service: CampaignOrchestrationWorkflowService;

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
    campaignMemoryQueueService.queueExtraction.mockResolvedValue('memory-job');
    orchestratorQueueService.queueCampaignRun.mockResolvedValue(
      'orchestrator-job',
    );
    triggerEvaluatorQueueService.queueCampaignEvaluation.mockResolvedValue(
      'trigger-job',
    );

    service = new CampaignOrchestrationWorkflowService(
      logger as never,
      prisma as never,
      cacheService as never,
      campaignMemoryQueueService as never,
      orchestratorQueueService as never,
      triggerEvaluatorQueueService as never,
    );
  });

  it('skips due campaign orchestration when the org lock already exists', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runDueCampaignOrchestration('org-1');

    expect(result).toMatchObject({
      action: 'agentCampaignOrchestration',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'campaign_orchestration_already_running',
      status: 'skipped',
    });
    expect(prisma.agentCampaign.findMany).not.toHaveBeenCalled();
    expect(cacheService.releaseLock).not.toHaveBeenCalled();
  });

  it('queues due active campaigns for orchestration and memory extraction', async () => {
    prisma.agentCampaign.findMany.mockResolvedValue([
      {
        config: {
          nextOrchestratedAt: '2026-06-24T08:59:00.000Z',
          orchestrationEnabled: true,
          status: 'active',
        },
        id: 'campaign-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        config: {
          nextOrchestratedAt: '2026-06-24T08:59:00.000Z',
          orchestrationEnabled: false,
          status: 'active',
        },
        id: 'campaign-disabled',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        config: {
          nextOrchestratedAt: '2026-06-24T09:05:00.000Z',
          orchestrationEnabled: true,
          status: 'active',
        },
        id: 'campaign-future',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.runDueCampaignOrchestration('org-1');

    expect(prisma.agentCampaign.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'asc' },
      take: 100,
      where: { isDeleted: false, organizationId: 'org-1' },
    });
    expect(orchestratorQueueService.queueCampaignRun).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      organizationId: 'org-1',
      scheduledAt: new Date('2026-06-24T08:59:00.000Z'),
      userId: 'user-1',
    });
    expect(campaignMemoryQueueService.queueExtraction).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      organizationId: 'org-1',
      scheduledAt: new Date('2026-06-24T08:59:00.000Z'),
      userId: 'user-1',
    });
    expect(result).toMatchObject({
      action: 'agentCampaignOrchestration',
      enqueued: 1,
      organizationId: 'org-1',
      skipped: 0,
      status: 'enqueued',
    });
    expect(cacheService.releaseLock).toHaveBeenCalledWith(
      'workflow-agent-campaign:agentCampaignOrchestration:org-1',
    );
  });

  it('returns a skipped trigger evaluation result when no campaigns are eligible', async () => {
    prisma.agentCampaign.findMany.mockResolvedValue([
      {
        agents: [],
        config: { orchestrationEnabled: true, status: 'active' },
        id: 'campaign-without-agents',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        agents: [{}],
        config: { orchestrationEnabled: true, status: 'paused' },
        id: 'campaign-paused',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.runTriggerEvaluations('org-1');

    expect(result).toMatchObject({
      action: 'agentCampaignTriggerEvaluation',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'no_trigger_evaluation_campaigns',
      status: 'skipped',
    });
    expect(
      triggerEvaluatorQueueService.queueCampaignEvaluation,
    ).not.toHaveBeenCalled();
  });

  it('queues trigger evaluation for active campaigns with agents', async () => {
    prisma.agentCampaign.findMany.mockResolvedValue([
      {
        agents: [{}],
        config: { orchestrationEnabled: true, status: 'active' },
        id: 'campaign-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);

    const result = await service.runTriggerEvaluations('org-1');

    expect(prisma.agentCampaign.findMany).toHaveBeenCalledWith({
      include: { agents: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      where: { isDeleted: false, organizationId: 'org-1' },
    });
    expect(
      triggerEvaluatorQueueService.queueCampaignEvaluation,
    ).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result).toMatchObject({
      action: 'agentCampaignTriggerEvaluation',
      enqueued: 1,
      organizationId: 'org-1',
      skipped: 0,
      status: 'enqueued',
    });
  });
});
