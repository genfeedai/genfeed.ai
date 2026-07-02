import {
  SYSTEM_WORKFLOW_ACTION_DEFINITIONS,
  SYSTEM_WORKFLOW_ACTION_IDS,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@api/collections/workflows/system-workflow.contract';
import { WorkflowStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowsService seeded livestream bot workflows', () => {
  const tx = {
    workflow: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(),
    workflow: {
      findFirst: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: WorkflowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflow.findFirst.mockResolvedValue(null);
    tx.workflow.findFirst.mockResolvedValue(null);
    tx.workflow.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (
        callback: (transactionClient: typeof tx) => Promise<void>,
      ): Promise<void> => callback(tx),
    );

    service = new WorkflowsService(prisma as never, logger as never);
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

  it('does not seed a duplicate livestream bot workflow', async () => {
    prisma.workflow.findFirst.mockResolvedValue({ id: 'workflow-1' });

    await service.ensureLivestreamBotWorkflows('user-1', 'org-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('seeds action-level system workflows for hardcoded product action replacements', async () => {
    await service.ensureSystemActionWorkflows('user-1', 'org-1');

    expect(tx.workflow.create).toHaveBeenCalledTimes(
      SYSTEM_WORKFLOW_ACTION_DEFINITIONS.length,
    );
    expect(tx.workflow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isScheduleEnabled: true,
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
});
