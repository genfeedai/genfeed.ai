import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolHandler } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-handler.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentWorkflowToolHandler setWorkflowSchedule', () => {
  const workflowsService = {
    findOne: vi.fn(),
  };
  const workflowSchedulerService = {
    updateSchedule: vi.fn(),
  };
  const ctx = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  let handler: AgentWorkflowToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsService.findOne.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: false,
      schedule: null,
      timezone: 'UTC',
    });

    handler = new AgentWorkflowToolHandler(
      {} as never,
      workflowsService as never,
      {} as never,
      workflowSchedulerService as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('persists an enabled schedule and registers the workflow scheduler', async () => {
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: true,
      schedule: '0 9 * * 1-5',
      timezone: 'Europe/Malta',
    });

    const result = await handler.setWorkflowSchedule(
      {
        enabled: true,
        schedule: '0 9 * * 1-5',
        timezone: 'Europe/Malta',
        workflowId: 'workflow-1',
      },
      ctx,
    );

    expect(workflowsService.findOne).toHaveBeenCalledWith({
      id: 'workflow-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
      'workflow-1',
      '0 9 * * 1-5',
      'Europe/Malta',
      true,
    );
    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        enabled: true,
        schedule: '0 9 * * 1-5',
        timezone: 'Europe/Malta',
        workflowId: 'workflow-1',
      },
      success: true,
    });
  });

  it('clears the schedule and unregisters the workflow scheduler', async () => {
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: false,
      schedule: null,
      timezone: 'UTC',
    });

    const result = await handler.setWorkflowSchedule(
      { enabled: false, workflowId: 'workflow-1' },
      ctx,
    );

    expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
      'workflow-1',
      null,
      'UTC',
      false,
    );
    expect(result.data).toEqual({
      enabled: false,
      schedule: null,
      timezone: 'UTC',
      workflowId: 'workflow-1',
    });
  });

  it('rejects a workflow outside the caller organization', async () => {
    workflowsService.findOne.mockResolvedValue(null);

    await expect(
      handler.setWorkflowSchedule(
        {
          enabled: true,
          schedule: '0 9 * * *',
          workflowId: 'foreign-workflow',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(workflowSchedulerService.updateSchedule).not.toHaveBeenCalled();
  });

  it('rejects an invalid cron expression before persisting', async () => {
    const result = handler.setWorkflowSchedule(
      {
        enabled: true,
        schedule: 'invalid-cron',
        workflowId: 'workflow-1',
      },
      ctx,
    );

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      'Invalid cron expression "invalid-cron" for timezone "UTC". Use a valid cron expression such as "0 9 * * 1-5".',
    );
    expect(workflowSchedulerService.updateSchedule).not.toHaveBeenCalled();
  });
});
