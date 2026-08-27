import {
  SYSTEM_WORKFLOW_ACTION_DEFINITIONS,
  SYSTEM_WORKFLOW_ACTION_IDS,
} from '@server/collections/workflows/system-workflow-provenance.service';
import { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import {
  buildSystemWorkflowDuplicateMetadata,
  buildSystemWorkflowMetadata,
  getSystemWorkflowDuplicateMetadata,
  SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@server/collections/workflows/system-workflow.contract';
import { WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowTemplateSeederService seeded livestream bot workflows', () => {
  const tx = {
    workflow: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(),
    workflow: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const workflowExecutionQueueService = {
    syncWorkflowScheduler: vi.fn(),
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
    prisma.workflow.updateMany.mockResolvedValue({ count: 0 });
    workflowExecutionQueueService.syncWorkflowScheduler.mockResolvedValue(
      undefined,
    );
    tx.workflow.findFirst.mockResolvedValue(null);
    tx.workflow.create.mockResolvedValue({});
    tx.workflow.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (
        callback: (transactionClient: typeof tx) => Promise<void>,
      ): Promise<void> => callback(tx),
    );

    service = new WorkflowTemplateSeederService(
      prisma as never,
      logger as never,
      workflowExecutionQueueService as never,
    );
  });

  it('seeds the livestream bot workflow default-on for an organization', async () => {
    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
        label: 'Livestream Bot Session Processing',
        metadata: expect.objectContaining({
          sourceIssue: 793,
          sourceTemplateChangeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
          sourceTemplateId: 'livestream-bot-session-processing',
          sourceTemplateVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
          sourceType: 'seeded-template',
          systemWorkflow: expect.objectContaining({
            canonicalId: 'livestream-bot-session-processing',
            changeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
            credentialPolicy: 'tenant-connected-account',
            duplicable: true,
            immutable: true,
            kind: 'system-workflow',
            owner: 'genfeed',
            productizationIssue: 1011,
            sourceIssue: 793,
            version: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
            visibility: 'organization',
          }),
        }),
        organizationId: 'org-1',
        schedule: '*/1 * * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
        userId: 'user-1',
      }),
    });
    expect(tx.workflow.create.mock.calls[0][0].data.nodes).toEqual([
      expect.objectContaining({
        id: 'livestreamBotSessionProcessing',
        type: 'livestreamBotSessionProcessing',
      }),
    ]);
  });

  it('seeds the content loop autopilot workflow default-on for an organization (#3018)', async () => {
    await service.ensureContentLoopAutopilotWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
        label: 'Content Loop Autopilot',
        metadata: expect.objectContaining({
          sourceIssue: 3018,
          sourceTemplateId: 'content-loop-autopilot',
          sourceType: 'seeded-template',
          systemWorkflow: expect.objectContaining({
            canonicalId: 'content-loop-autopilot',
            credentialPolicy: 'tenant-connected-account',
            sourceIssue: 3018,
          }),
        }),
        organizationId: 'org-1',
        schedule: '0 8 * * *',
        status: WorkflowStatus.ACTIVE,
        userId: 'user-1',
      }),
    });
    expect(tx.workflow.create.mock.calls[0][0].data.nodes).toEqual([
      expect.objectContaining({
        id: 'analyticsGenericSync',
        type: 'analyticsGenericSync',
      }),
      expect.objectContaining({
        id: 'harnessWinnerPromotionSweep',
        type: 'harnessWinnerPromotionSweep',
      }),
    ]);
  });

  it('seeds the outreach campaign dispatch workflow default-on for an organization (#3407)', async () => {
    await service.ensureOutreachCampaignDispatchWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
        label: 'Outreach Campaign Dispatch',
        metadata: expect.objectContaining({
          sourceIssue: 3407,
          sourceTemplateId: 'outreach-campaign-dispatch',
          sourceType: 'seeded-template',
          systemWorkflow: expect.objectContaining({
            canonicalId: 'outreach-campaign-dispatch',
            sourceIssue: 3407,
          }),
        }),
        organizationId: 'org-1',
        schedule: '*/1 * * * *',
        status: WorkflowStatus.ACTIVE,
        userId: 'user-1',
      }),
    });
    expect(tx.workflow.create.mock.calls[0][0].data.nodes).toEqual([
      expect.objectContaining({
        id: 'outreachCampaignDispatch',
        type: 'outreachCampaignDispatch',
      }),
    ]);
  });

  it('does not seed a duplicate livestream bot workflow', async () => {
    prisma.workflow.findFirst.mockImplementation(({ where }) => {
      const sourceTemplateId = where.metadata.equals;
      return Promise.resolve({
        id: `workflow-${sourceTemplateId}`,
        metadata: {
          sourceIssue: 793,
          sourceTemplateChangeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
          sourceTemplateId,
          sourceTemplateVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
          sourceType: 'seeded-template',
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: sourceTemplateId,
            sourceIssue: 793,
          }),
        },
      });
    });

    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.workflow.update).not.toHaveBeenCalled();
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('repairs legacy seeded workflow metadata without creating a duplicate', async () => {
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'workflow-1',
      metadata: {
        legacyFlag: true,
        sourceTemplateId: 'livestream-bot-session-processing',
      },
    });

    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      data: {
        metadata: expect.objectContaining({
          legacyFlag: true,
          sourceIssue: 793,
          sourceTemplateChangeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
          sourceTemplateId: 'livestream-bot-session-processing',
          sourceTemplateVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
          sourceType: 'seeded-template',
          systemWorkflow: expect.objectContaining({
            canonicalId: 'livestream-bot-session-processing',
            immutable: true,
            owner: 'genfeed',
            version: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
            visibility: 'organization',
          }),
        }),
      },
      where: { id: 'workflow-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('repairs legacy daily trends metadata while preserving the enabled repair', async () => {
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: false,
      metadata: {
        sourceTemplateId: 'daily-trends-digest',
      },
    });

    await service.ensureDailyTrendsDigestWorkflow('user-1', 'org-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.workflow.update).toHaveBeenCalledWith({
      data: {
        isScheduleEnabled: true,
        metadata: expect.objectContaining({
          sourceIssue: 1011,
          sourceTemplateChangeSummary:
            'Initial daily trend digest system workflow with trend assembly and owner email delivery.',
          sourceTemplateId: 'daily-trends-digest',
          sourceTemplateVersion: 1,
          sourceType: 'seeded-template',
          systemWorkflow: expect.objectContaining({
            canonicalId: 'daily-trends-digest',
            immutable: true,
            owner: 'genfeed',
            version: 1,
            visibility: 'organization',
          }),
        }),
      },
      where: { id: 'workflow-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('marks stale system workflow duplicates as upgrade available', async () => {
    const sourceSystemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'daily-trends-digest',
      changeSummary: 'Initial daily digest.',
      version: 1,
    });
    const duplicateMetadata = buildSystemWorkflowDuplicateMetadata(
      { customFlag: true, systemWorkflow: sourceSystemWorkflow },
      'system-workflow-1',
    );
    const currentSystemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'daily-trends-digest',
      changeSummary: 'Add owner summary delivery.',
      version: 2,
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'duplicate-1',
        metadata: duplicateMetadata,
      },
    ]);

    await service.reconcileSystemWorkflowDuplicates(
      'org-1',
      currentSystemWorkflow,
    );

    expect(prisma.workflow.findMany).toHaveBeenCalledWith({
      select: { id: true, metadata: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: 'daily-trends-digest',
          path: [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY, 'canonicalId'],
        },
        organizationId: 'org-1',
      },
    });
    expect(prisma.workflow.updateMany).toHaveBeenCalledWith({
      data: {
        metadata: expect.objectContaining({
          customFlag: true,
          duplicatedFromSystemWorkflow: expect.objectContaining({
            canonicalId: 'daily-trends-digest',
            currentSystemWorkflowChangeSummary: 'Add owner summary delivery.',
            currentSystemWorkflowVersion: 2,
            sourceWorkflowVersion: 1,
            upgradeEligible: true,
            upgradeStatus: 'upgrade_available',
          }),
        }),
      },
      where: {
        id: 'duplicate-1',
        isDeleted: false,
        metadata: { equals: duplicateMetadata },
        organizationId: 'org-1',
      },
    });
  });

  it('does not write duplicate metadata that already matches the canonical version', async () => {
    const currentSystemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'daily-trends-digest',
      changeSummary: 'Current daily digest.',
      version: 2,
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'duplicate-1',
        metadata: buildSystemWorkflowDuplicateMetadata(
          { systemWorkflow: currentSystemWorkflow },
          'system-workflow-1',
        ),
      },
    ]);

    await service.reconcileSystemWorkflowDuplicates(
      'org-1',
      currentSystemWorkflow,
    );

    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('retries duplicate reconciliation after a metadata compare-and-swap miss', async () => {
    const currentSystemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'livestream-bot-session-processing',
      sourceIssue: 793,
      version: 1,
    });
    const duplicateMetadata = buildSystemWorkflowDuplicateMetadata(
      { systemWorkflow: currentSystemWorkflow },
      'system-workflow-1',
    );
    const duplicateProvenance =
      getSystemWorkflowDuplicateMetadata(duplicateMetadata);

    if (!duplicateProvenance) {
      throw new Error('Expected valid duplicate provenance fixture');
    }

    const staleMetadata = {
      ...duplicateMetadata,
      duplicatedFromSystemWorkflow: {
        ...duplicateProvenance,
        currentSystemWorkflowChangeSummary: 'Stale projection.',
        currentSystemWorkflowVersion: 2,
        upgradeEligible: true,
        upgradeStatus: 'upgrade_available' as const,
      },
    };
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'system-workflow-1',
      metadata: {
        sourceIssue: 793,
        sourceTemplateChangeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
        sourceTemplateId: 'livestream-bot-session-processing',
        sourceTemplateVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
        sourceType: 'seeded-template',
        systemWorkflow: currentSystemWorkflow,
      },
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'duplicate-1',
        metadata: staleMetadata,
      },
    ]);
    prisma.workflow.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');
    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(prisma.workflow.updateMany).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      'System workflow duplicate metadata changed before reconciliation; retrying on a later seed pass',
      {
        canonicalId: 'livestream-bot-session-processing',
        organizationId: 'org-1',
        workflowId: 'duplicate-1',
      },
    );
    expect(prisma.workflow.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            duplicatedFromSystemWorkflow: expect.objectContaining({
              currentSystemWorkflowVersion: 1,
              upgradeEligible: false,
              upgradeStatus: 'current',
            }),
          }),
        },
        where: expect.objectContaining({
          id: 'duplicate-1',
          metadata: { equals: staleMetadata },
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('skips malformed and foreign system workflow duplicate metadata', async () => {
    const currentSystemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'daily-trends-digest',
      changeSummary: 'Current daily digest.',
      version: 2,
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'malformed-duplicate',
        metadata: {
          duplicatedFromSystemWorkflow: {
            canonicalId: 'daily-trends-digest',
          },
        },
      },
      {
        id: 'foreign-duplicate',
        metadata: buildSystemWorkflowDuplicateMetadata(
          {
            systemWorkflow: buildSystemWorkflowMetadata({
              canonicalId: 'scheduled-post-publishing',
            }),
          },
          'system-workflow-2',
        ),
      },
    ]);

    await service.reconcileSystemWorkflowDuplicates(
      'org-1',
      currentSystemWorkflow,
    );

    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipped system workflow duplicate reconciliation for invalid provenance',
      {
        canonicalId: 'daily-trends-digest',
        organizationId: 'org-1',
        workflowId: 'malformed-duplicate',
      },
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipped system workflow duplicate reconciliation for invalid provenance',
      {
        canonicalId: 'daily-trends-digest',
        organizationId: 'org-1',
        workflowId: 'foreign-duplicate',
      },
    );
  });

  it('seeds action-level system workflows for hardcoded product action replacements', async () => {
    await service.ensureSystemActionWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledTimes(
      SYSTEM_WORKFLOW_ACTION_DEFINITIONS.length,
    );
    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        // System action schedules are display metadata; firing happens in the
        // workers sweep scheduler (issue #1092).
        isScheduleEnabled: false,
        label: 'Scheduled Post Publishing',
        metadata: expect.objectContaining({
          sourceIssue: 1011,
          sourceTemplateChangeSummary:
            'Initial scheduled publish system workflow action wrapper.',
          sourceTemplateId:
            SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
          sourceTemplateVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
          sourceType: 'system-action-workflow',
          systemWorkflow: expect.objectContaining({
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
            changeSummary:
              'Initial scheduled publish system workflow action wrapper.',
            immutable: true,
            kind: 'system-workflow',
            version: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
          }),
        }),
        organizationId: 'org-1',
        schedule: '*/15 * * * *',
        status: WorkflowStatus.ACTIVE,
        userId: 'user-1',
      }),
    });
    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: false,
        label: 'Reply and DM Automation',
        metadata: expect.objectContaining({
          sourceTemplateId: SYSTEM_WORKFLOW_ACTION_IDS.REPLY_DM_AUTOMATION,
          sourceType: 'system-action-workflow',
        }),
        schedule: undefined,
      }),
    });
  });

  it('loads workflow metadata when syncing organization schedulers', async () => {
    const systemWorkflow = buildSystemWorkflowMetadata({
      canonicalId: 'scheduled-post-publishing',
    });
    prisma.workflow.findMany.mockResolvedValue([
      {
        id: 'wf-system',
        isDeleted: false,
        isScheduleEnabled: true,
        metadata: { systemWorkflow },
        schedule: '*/15 * * * *',
        status: WorkflowStatus.ACTIVE,
        timezone: 'UTC',
      },
    ]);

    await service.syncOrganizationWorkflowSchedulers('org-1');

    expect(prisma.workflow.findMany).toHaveBeenCalledWith({
      select: expect.objectContaining({
        id: true,
        isDeleted: true,
        isScheduleEnabled: true,
        metadata: true,
        schedule: true,
        status: true,
        timezone: true,
      }),
      where: expect.objectContaining({
        isDeleted: false,
        isScheduleEnabled: true,
        organizationId: 'org-1',
        schedule: { not: null },
        status: WorkflowStatus.ACTIVE,
      }),
    });
    expect(
      workflowExecutionQueueService.syncWorkflowScheduler,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wf-system',
        metadata: { systemWorkflow },
      }),
    );
  });
});
