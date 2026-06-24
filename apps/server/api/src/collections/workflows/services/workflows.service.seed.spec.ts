import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
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
        metadata: {
          sourceIssue: 793,
          sourceTemplateId: 'livestream-bot-session-processing',
          sourceType: 'seeded-template',
        },
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
});
