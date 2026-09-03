import { YOUTUBE_LONG_FORM_WORKFLOW_ID } from '@api/collections/workflows/services/youtube-long-form-workflow.constants';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolExecuteService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-execute.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentWorkflowToolExecuteService setWorkflowSchedule', () => {
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

  let handler: AgentWorkflowToolExecuteService;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsService.findOne.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: false,
      schedule: null,
      timezone: 'UTC',
    });

    handler = new AgentWorkflowToolExecuteService(
      workflowsService as never,
      {} as never,
      workflowSchedulerService as never,
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

  it('preserves the stored cron and timezone when disabling without a new schedule', async () => {
    workflowsService.findOne.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: true,
      schedule: '0 9 * * 1-5',
      timezone: 'America/New_York',
    });
    workflowSchedulerService.updateSchedule.mockResolvedValue({
      id: 'workflow-1',
      isScheduleEnabled: false,
      schedule: '0 9 * * 1-5',
      timezone: 'America/New_York',
    });

    const result = await handler.setWorkflowSchedule(
      { enabled: false, workflowId: 'workflow-1' },
      ctx,
    );

    expect(workflowSchedulerService.updateSchedule).toHaveBeenCalledWith(
      'workflow-1',
      '0 9 * * 1-5',
      'America/New_York',
      false,
    );
    expect(result.data).toEqual({
      enabled: false,
      schedule: '0 9 * * 1-5',
      timezone: 'America/New_York',
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

describe('AgentWorkflowToolExecuteService list / execute / inputs (tenant + contract)', () => {
  const workflowsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const workflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };
  const workflowExecutionsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const systemWorkflowRunner = {
    getWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const ctx = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  let handler: AgentWorkflowToolExecuteService;

  beforeEach(() => {
    vi.clearAllMocks();
    systemWorkflowRunner.getWorkflow.mockReturnValue(undefined);
    handler = new AgentWorkflowToolExecuteService(
      workflowsService as never,
      workflowExecutorService as never,
      {} as never,
      workflowExecutionsService as never,
      systemWorkflowRunner as never,
    );
  });

  it('lists workflows scoped to the caller organization only', async () => {
    workflowsService.findAll.mockResolvedValue({
      docs: [
        {
          description: 'Daily publish',
          id: 'wf-1',
          name: 'Publish',
          status: 'active',
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });

    const result = await handler.listWorkflows({ limit: 5 }, ctx);

    expect(workflowsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { updatedAt: -1 },
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      count: 1,
      workflows: [
        {
          description: 'Daily publish',
          id: 'wf-1',
          name: 'Publish',
          status: 'active',
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
    });
  });

  it('refuses to execute a workflow outside the organization', async () => {
    workflowsService.findOne.mockResolvedValue(null);

    const result = await handler.executeWorkflow(
      { workflowId: 'wf-foreign' },
      ctx,
    );

    expect(workflowsService.findOne).toHaveBeenCalledWith({
      id: 'wf-foreign',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Workflow wf-foreign not found',
      success: false,
    });
    expect(
      workflowExecutorService.executeManualWorkflow,
    ).not.toHaveBeenCalled();
  });

  it('blocks execute when required inputs are missing', async () => {
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [
        { key: 'topic', required: true },
        { key: 'tone', required: false },
      ],
    });

    const result = await handler.executeWorkflow(
      { inputs: { tone: 'dry' }, workflowId: 'wf-1' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing required workflow inputs: topic/);
    expect(
      workflowExecutorService.executeManualWorkflow,
    ).not.toHaveBeenCalled();
  });

  it('executes a manual workflow with org/user and accepts inputs alias', async () => {
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [{ key: 'topic', required: true }],
    });
    workflowExecutorService.executeManualWorkflow.mockResolvedValue({
      executionId: 'exec-1',
      status: 'RUNNING',
    });

    const result = await handler.executeWorkflow(
      { inputValues: { topic: 'launch' }, workflowId: 'wf-1' },
      ctx,
    );

    expect(workflowExecutorService.executeManualWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'user-1',
      'org-1',
      { topic: 'launch' },
    );
    expect(result).toEqual({
      creditsUsed: 0,
      data: { id: 'exec-1', status: 'RUNNING' },
      success: true,
    });
  });

  it('executes a hidden system workflow through the shared runner, not a workflow-ID special case', async () => {
    const longFormResult = {
      content: 'Long-form result',
      contentId: 'article-1',
      outputType: 'x-article',
      sourceArtifactId: 'artifact-1',
      summary: 'Summary text',
      title: 'Video title',
      videoId: 'video-1',
      youtubeUrl: 'https://youtu.be/video-1',
    };
    systemWorkflowRunner.getWorkflow.mockReturnValue({
      canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      definition: {
        inputVariables: [
          { key: 'youtubeUrl', required: true },
          { defaultValue: 'article', key: 'outputType', required: true },
          { defaultValue: 'account', key: 'persistence', required: true },
          { defaultValue: 'ttl', key: 'retentionPolicy', required: true },
          { key: 'brandId', required: false },
        ],
      },
      label: 'YouTube to Long-form Text',
    });
    systemWorkflowRunner.runWorkflow.mockResolvedValue({
      provenance: { executionId: 'execution-1' },
      result: longFormResult,
    });

    const result = await handler.executeWorkflow(
      {
        variables: {
          outputType: 'x-article',
          youtubeUrl: 'https://youtu.be/video-1',
        },
        workflowId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      },
      ctx,
    );

    expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith({
      actionType: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      inputValues: {
        outputType: 'x-article',
        persistence: 'account',
        retentionPolicy: 'ttl',
        youtubeUrl: 'https://youtu.be/video-1',
      },
      metadata: { origin: 'agent' },
      organizationId: 'org-1',
      source: 'AgentWorkflowToolExecuteService.executeWorkflow',
      userId: 'user-1',
    });
    expect(workflowsService.findOne).not.toHaveBeenCalled();
    expect(
      workflowExecutorService.executeManualWorkflow,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        id: 'execution-1',
        result: longFormResult,
        status: 'COMPLETED',
      },
      success: true,
    });
  });

  it('rejects a hidden system workflow when required inputs are missing', async () => {
    systemWorkflowRunner.getWorkflow.mockReturnValue({
      canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      definition: {
        inputVariables: [
          { key: 'youtubeUrl', required: true },
          { defaultValue: 'article', key: 'outputType', required: true },
        ],
      },
      label: 'YouTube to Long-form Text',
    });

    const result = await handler.executeWorkflow(
      {
        variables: {},
        workflowId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      },
      ctx,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error:
        'Missing required workflow inputs: youtubeUrl. Use get_workflow_inputs to discover expected variables.',
      success: false,
    });
    expect(systemWorkflowRunner.runWorkflow).not.toHaveBeenCalled();
  });

  it('returns workflow inputs for the org-scoped workflow only', async () => {
    workflowsService.findOne.mockResolvedValue({
      id: 'wf-1',
      inputVariables: [
        {
          description: 'Topic',
          key: 'topic',
          label: 'Topic',
          required: true,
          type: 'string',
        },
      ],
      label: 'Launch pack',
    });

    const result = await handler.getWorkflowInputs({ workflowId: 'wf-1' }, ctx);

    expect(workflowsService.findOne).toHaveBeenCalledWith({
      id: 'wf-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      inputs: [
        {
          defaultValue: null,
          description: 'Topic',
          key: 'topic',
          label: 'Topic',
          required: true,
          type: 'string',
        },
      ],
      workflowId: 'wf-1',
      workflowName: 'Launch pack',
    });
  });

  it('describes a hidden system workflow from its registered input contract', async () => {
    systemWorkflowRunner.getWorkflow.mockReturnValue({
      canonicalId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
      definition: {
        inputVariables: [
          {
            description: 'Public YouTube video URL with spoken audio.',
            key: 'youtubeUrl',
            label: 'YouTube URL',
            required: true,
            type: 'url',
          },
          {
            defaultValue: 'article',
            description: 'Long-form output format to persist.',
            key: 'outputType',
            label: 'Output format',
            required: true,
            type: 'enum',
            validation: {
              options: [
                'article',
                'linkedin-article',
                'x-article',
                'newsletter',
              ],
            },
          },
        ],
      },
      label: 'YouTube to Long-form Text',
    });

    const result = await handler.getWorkflowInputs(
      { workflowId: YOUTUBE_LONG_FORM_WORKFLOW_ID },
      ctx,
    );

    expect(workflowsService.findOne).not.toHaveBeenCalled();
    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        inputs: [
          {
            defaultValue: null,
            description: 'Public YouTube video URL with spoken audio.',
            key: 'youtubeUrl',
            label: 'YouTube URL',
            required: true,
            type: 'url',
          },
          {
            defaultValue: 'article',
            description: 'Long-form output format to persist.',
            key: 'outputType',
            label: 'Output format',
            required: true,
            type: 'enum',
            validation: {
              options: [
                'article',
                'linkedin-article',
                'x-article',
                'newsletter',
              ],
            },
          },
        ],
        workflowId: YOUTUBE_LONG_FORM_WORKFLOW_ID,
        workflowName: 'YouTube to Long-form Text',
      },
      success: true,
    });
  });
});

describe('AgentWorkflowToolExecuteService listWorkflowRuns / getWorkflowRun', () => {
  const workflowExecutionsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const ctx = {
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  let handler: AgentWorkflowToolExecuteService;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AgentWorkflowToolExecuteService(
      {} as never,
      {} as never,
      {} as never,
      workflowExecutionsService as never,
      {} as never,
    );
  });

  it('lists workflow runs scoped to the caller organization, converting offset to page', async () => {
    workflowExecutionsService.findAll.mockResolvedValue({
      docs: [{ id: 'run-1', status: 'COMPLETED' }],
    });

    const result = await handler.listWorkflowRuns(
      { limit: 10, offset: 20, status: 'COMPLETED', workflowId: 'wf-1' },
      ctx,
    );

    expect(workflowExecutionsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          status: 'COMPLETED',
          workflowId: 'wf-1',
        },
      },
      { limit: 10, page: 3 },
    );
    expect(result).toEqual({
      creditsUsed: 0,
      data: { count: 1, runs: [{ id: 'run-1', status: 'COMPLETED' }] },
      success: true,
    });
  });

  it('defaults to page 1 and limit 20 with no filters', async () => {
    workflowExecutionsService.findAll.mockResolvedValue({ docs: [] });

    const result = await handler.listWorkflowRuns({}, ctx);

    expect(workflowExecutionsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { createdAt: -1 },
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      },
      { limit: 20, page: 1 },
    );
    expect(result).toEqual({
      creditsUsed: 0,
      data: { count: 0, runs: [] },
      success: true,
    });
  });

  it('returns a workflow run scoped to the caller organization', async () => {
    workflowExecutionsService.findOne.mockResolvedValue({
      id: 'run-1',
      status: 'COMPLETED',
    });

    const result = await handler.getWorkflowRun({ runId: 'run-1' }, ctx);

    expect(workflowExecutionsService.findOne).toHaveBeenCalledWith({
      id: 'run-1',
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      creditsUsed: 0,
      data: { run: { id: 'run-1', status: 'COMPLETED' } },
      success: true,
    });
  });

  it('requires a runId', async () => {
    const result = await handler.getWorkflowRun({}, ctx);

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'runId is required',
      success: false,
    });
    expect(workflowExecutionsService.findOne).not.toHaveBeenCalled();
  });

  it('returns an error when the run is missing or belongs to another organization', async () => {
    workflowExecutionsService.findOne.mockResolvedValue(null);

    const result = await handler.getWorkflowRun({ runId: 'run-2' }, ctx);

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Workflow run run-2 not found',
      success: false,
    });
  });
});
