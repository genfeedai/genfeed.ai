import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentToolName } from '@genfeedai/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentWorkflowToolCreateService', () => {
  const workflowsService = {
    createWorkflow: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };
  const workflowGenerationService = {
    generateWorkflowFromDescription: vi.fn(),
  };
  const ctx = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  let service: AgentWorkflowToolCreateService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandsService.findOne.mockResolvedValue({
      id: 'brand-1',
      label: 'Acme',
    });
    workflowsService.createWorkflow.mockResolvedValue({ id: 'wf-1' });
    service = new AgentWorkflowToolCreateService(
      workflowsService as never,
      brandsService as never,
      workflowGenerationService as never,
    );
  });

  it('returns a tool error when no brand is available', async () => {
    brandsService.findOne.mockResolvedValue(null);

    const result = await service.createWorkflow({ label: 'Daily pack' }, ctx);

    expect(result).toEqual({
      creditsUsed: 0,
      error:
        'No valid brand is available. Select a brand or refresh your brand context before creating a workflow.',
      success: false,
    });
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('requires a label when no graph or recurring scaffold is supplied', async () => {
    const result = await service.createWorkflow({}, ctx);

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'label is required',
      success: false,
    });
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('creates a labeled workflow with the resolved brand and agent metadata', async () => {
    const result = await service.createWorkflow({ label: 'Launch pack' }, ctx);

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        brandId: 'brand-1',
        label: 'Launch pack',
        metadata: expect.objectContaining({
          brandId: 'brand-1',
          createdFrom: 'agent',
          originatingTool: AgentToolName.CREATE_WORKFLOW,
        }),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      brandId: 'brand-1',
      editorUrl: '/automation/workflows/wf-1',
      id: 'wf-1',
      label: 'Launch pack',
    });
    expect(result.nextActions?.[0]).toMatchObject({
      title: 'Automation created',
      type: 'workflow_created_card',
      workflowId: 'wf-1',
      workflowName: 'Launch pack',
    });
  });

  it('uses the recurring scaffold when prompt and schedule are present', async () => {
    const result = await service.createWorkflow(
      {
        contentType: 'image',
        prompt: 'sunrise city skyline',
        schedule: '0 9 * * 1-5',
      },
      ctx,
    );

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        brandId: 'brand-1',
        isScheduleEnabled: true,
        schedule: '0 9 * * 1-5',
      }),
    );
    const payload = workflowsService.createWorkflow.mock.calls[0]?.[2] as {
      nodes: Array<{
        data: { config: { actionId: string; parameters: unknown } };
        type: string;
      }>;
    };
    expect(payload.nodes[0]).toMatchObject({
      data: {
        config: {
          actionId: 'imageGen',
          parameters: expect.objectContaining({
            prompt: expect.stringContaining('sunrise city skyline'),
          }),
        },
      },
      type: 'genfeedAction',
    });
    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(1);
    expect(result.data).toMatchObject({
      brandId: 'brand-1',
      count: 1,
      id: 'wf-1',
    });
  });

  it('generates a graph from a natural-language description', async () => {
    workflowGenerationService.generateWorkflowFromDescription.mockResolvedValue(
      {
        workflow: {
          description: 'Generated digest',
          edges: [{ id: 'e1' }],
          name: 'Generated digest',
          nodes: [
            {
              data: {
                config: { actionId: 'trendDigest', parameters: {} },
                label: 'Build digest',
              },
              id: 'n1',
              position: { x: 0, y: 0 },
              type: 'genfeedAction',
            },
          ],
        },
      },
    );

    const result = await service.createWorkflow(
      { description: 'daily trends digest' },
      ctx,
    );

    expect(
      workflowGenerationService.generateWorkflowFromDescription,
    ).toHaveBeenCalledWith({
      description: 'daily trends digest',
      targetPlatforms: undefined,
    });
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        description: 'Generated digest',
        edges: [{ id: 'e1' }],
        label: 'Generated digest',
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({ actionId: 'trendDigest' }),
            }),
            id: 'n1',
            type: 'genfeedAction',
          }),
        ],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'wf-1',
      label: 'Generated digest',
    });
  });
});
