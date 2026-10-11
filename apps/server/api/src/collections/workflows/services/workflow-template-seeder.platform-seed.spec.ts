import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import {
  findPlatformSeedTemplate,
  getPlatformSeedContentHash,
  isCanonicalPlatformSeed,
  isPlatformScheduledTemplate,
  PLATFORM_SEED_TEMPLATE_SETS,
} from '@api/collections/workflows/utils/workflow-platform-seed.util';
import {
  buildWorkflowVersionDefinition,
  splitWorkflowDefinition,
} from '@api/collections/workflows/workflow-version-definition';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ENSURE_METHODS = [
  'ensureAdAutomationWorkflows',
  'ensureAgentAutopilotWorkflows',
  'ensureAnalyticsSyncWorkflows',
  'ensureCampaignOrchestrationWorkflows',
  'ensureContentLearningWorkflows',
  'ensureContentLoopAutopilotWorkflows',
  'ensureContentProductionWorkflows',
  'ensureLivestreamBotWorkflows',
  'ensureOutreachCampaignDispatchWorkflows',
  'ensureReplyPollingWorkflows',
  'ensureTrendNotificationWorkflows',
] as const;

describe('WorkflowTemplateSeederService platform authority (#6689)', () => {
  const prisma = {
    workflow: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const workflowsService = {
    create: vi.fn(),
    createPlatformSeeded: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowTemplateSeederService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflow.findFirst.mockResolvedValue(null);
    prisma.workflow.findMany.mockResolvedValue([]);
    prisma.workflow.update.mockResolvedValue({});
    prisma.workflow.updateMany.mockResolvedValue({ count: 1 });
    workflowsService.create.mockResolvedValue({});
    workflowsService.createPlatformSeeded.mockResolvedValue({});
    service = new WorkflowTemplateSeederService(
      prisma as never,
      logger as never,
      workflowsService as never,
    );
  });

  it('seeds every set so a scheduled template is a canonical platform row and the rest are plain', async () => {
    for (const method of ENSURE_METHODS) {
      await service[method]('seed-user', 'org-1');
    }

    const platformCalls = workflowsService.createPlatformSeeded.mock.calls as [
      Record<string, unknown>,
      string,
    ][];
    const allTemplates = Object.values(PLATFORM_SEED_TEMPLATE_SETS).flatMap(
      (set) => [...set.templates],
    );
    const scheduled = allTemplates.filter(isPlatformScheduledTemplate);

    expect(platformCalls.map(([, key]) => key).sort()).toEqual(
      scheduled.map((template) => template.id).sort(),
    );
    expect(workflowsService.create).toHaveBeenCalledTimes(
      allTemplates.length - scheduled.length,
    );

    for (const [dto, key] of platformCalls) {
      const template = findPlatformSeedTemplate(key);
      expect(template).toBeDefined();
      // The version the seeder writes is exactly the one the scheduler later demands.
      const { definition } = splitWorkflowDefinition(dto);
      const written = buildWorkflowVersionDefinition(definition).contentHash;
      expect(written).toBe(
        getPlatformSeedContentHash(template as NonNullable<typeof template>),
      );
      expect(
        isCanonicalPlatformSeed({
          brandId: null,
          currentVersion: { contentHash: written },
          platformSeedKey: key,
        }),
      ).toBe(true);
    }
  });

  it('treats a unique violation from a concurrent seeder as already seeded', async () => {
    workflowsService.createPlatformSeeded.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        clientVersion: 'test',
        code: 'P2002',
      }),
    );

    await expect(
      service.ensureAnalyticsSyncWorkflows('seed-user', 'org-1'),
    ).resolves.toBeUndefined();
  });

  it('rethrows any other create failure', async () => {
    workflowsService.createPlatformSeeded.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      service.ensureAnalyticsSyncWorkflows('seed-user', 'org-1'),
    ).rejects.toThrow('connection lost');
  });

  it('reconciles an existing row through the ensure path and marks it only when canonical', async () => {
    const template = PLATFORM_SEED_TEMPLATE_SETS.analyticsSync.templates[2];
    const canonicalHash = getPlatformSeedContentHash(template);
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'wf-existing',
      metadata: { sourceTemplateId: template.id },
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        brandId: null,
        currentVersion: { contentHash: canonicalHash },
        currentVersionId: 'version-1',
        id: 'wf-existing',
        isScheduleEnabled: true,
        metadata: {
          sourceTemplateId: template.id,
          sourceType: 'seeded-template',
        },
        platformSeedKey: null,
        userId: 'seed-user',
      },
    ]);

    await service.ensureAnalyticsSyncWorkflows('seed-user', 'org-1');

    expect(workflowsService.createPlatformSeeded).not.toHaveBeenCalled();
    expect(prisma.workflow.updateMany).toHaveBeenCalledWith({
      data: {
        platformSeedKey: template.id,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: expect.objectContaining({
        id: 'wf-existing',
        organizationId: 'org-1',
        platformSeedKey: null,
        userId: 'seed-user',
      }),
    });
  });

  describe('reconcilePlatformSeedMarkers (operator backfill)', () => {
    it('never creates workflows and reports an outcome for every catalog template', async () => {
      const outcomes = await service.reconcilePlatformSeedMarkers(
        'seed-user',
        'org-1',
      );
      const ids = Object.values(PLATFORM_SEED_TEMPLATE_SETS).flatMap((set) =>
        set.templates.map((template) => template.id),
      );

      expect(Object.keys(outcomes).sort()).toEqual([...ids].sort());
      expect(workflowsService.create).not.toHaveBeenCalled();
      expect(workflowsService.createPlatformSeeded).not.toHaveBeenCalled();
      expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
      expect(new Set(Object.values(outcomes))).toEqual(
        new Set(['no-canonical-row', 'not-scheduled']),
      );
    });

    it('marks rows forged with seeded metadata only when the graph is canonical', async () => {
      const [first] = PLATFORM_SEED_TEMPLATE_SETS.analyticsSync.templates;
      prisma.workflow.findMany.mockImplementation(
        async (args: { where: { metadata: { equals: string } } }) =>
          args.where.metadata.equals === first.id
            ? [
                {
                  brandId: null,
                  currentVersion: { contentHash: 'sha256:v1:forged' },
                  currentVersionId: 'version-forged',
                  id: 'wf-forged',
                  isScheduleEnabled: true,
                  metadata: {
                    sourceTemplateId: first.id,
                    sourceType: 'seeded-template',
                  },
                  platformSeedKey: null,
                  userId: 'seed-user',
                },
              ]
            : [],
      );

      const outcomes = await service.reconcilePlatformSeedMarkers(
        'seed-user',
        'org-1',
      );

      expect(outcomes[first.id]).toBe('no-canonical-row');
      expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
    });
  });
});
