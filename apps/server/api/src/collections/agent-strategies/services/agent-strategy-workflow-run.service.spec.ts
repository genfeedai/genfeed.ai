import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AgentStrategyWorkflowRunService } from './agent-strategy-workflow-run.service';

describe('AgentStrategyWorkflowRunService', () => {
  const strategy = {
    agentType: 'x_content',
    brandId: 'brand-1',
    id: 'strategy-1',
    label: 'X Writer',
    platforms: ['twitter'],
    topics: ['AI agents'],
    userId: 'user-1',
    voice: 'Direct founder voice',
  };

  function buildService(overrides?: {
    createWorkflow?: ReturnType<typeof vi.fn>;
    executeManualWorkflow?: ReturnType<typeof vi.fn>;
    findInstalled?: ReturnType<typeof vi.fn>;
    findOneWorkflow?: ReturnType<typeof vi.fn>;
    patchStrategy?: ReturnType<typeof vi.fn>;
  }) {
    const agentStrategiesService = {
      findOneById: vi.fn().mockResolvedValue(strategy),
      patch: overrides?.patchStrategy ?? vi.fn().mockResolvedValue(strategy),
    };
    const workflowsService = {
      createWorkflow:
        overrides?.createWorkflow ??
        vi.fn().mockResolvedValue({ id: 'wf-created' }),
      findOne:
        overrides?.findOneWorkflow ??
        vi.fn().mockResolvedValue({
          id: 'wf-1',
          inputVariables: [
            { key: 'topic', label: 'Topic', required: true, type: 'text' },
            { key: 'angle', label: 'Angle', required: true, type: 'text' },
            { key: 'cta', label: 'CTA', required: false, type: 'text' },
          ],
          label: 'Founder X Post',
          metadata: { sourceTemplateId: 'founder-x-post' },
        }),
    };
    const workflowExecutorService = {
      executeManualWorkflow:
        overrides?.executeManualWorkflow ??
        vi.fn().mockResolvedValue({
          executionId: 'exec-1',
          status: 'running',
        }),
    };
    const prisma = {
      workflow: {
        findMany:
          overrides?.findInstalled ??
          vi.fn().mockResolvedValue([
            {
              brandId: 'brand-1',
              id: 'wf-1',
              inputVariables: [
                { key: 'topic', label: 'Topic', required: true, type: 'text' },
                { key: 'angle', label: 'Angle', required: true, type: 'text' },
                { key: 'cta', label: 'CTA', required: false, type: 'text' },
              ],
              label: 'Founder X Post',
              metadata: { sourceTemplateId: 'founder-x-post' },
              name: null,
            },
          ]),
      },
    };
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };

    return new AgentStrategyWorkflowRunService(
      agentStrategiesService as never,
      workflowsService as never,
      workflowExecutorService as never,
      prisma as never,
      logger as never,
    );
  }

  it('previews filled inputs from strategy topics and voice', async () => {
    const service = buildService();
    const preview = await service.preview('strategy-1', 'org-1');

    expect(preview.workflowId).toBe('wf-1');
    expect(preview.missingRequiredKeys).toEqual([]);
    const topic = preview.inputs.find((input) => input.key === 'topic');
    const angle = preview.inputs.find((input) => input.key === 'angle');
    expect(topic?.filledValue).toBe('AI agents');
    expect(String(angle?.filledValue)).toContain('AI agents');
  });

  it('runs workflow with deterministic inputs and provenance metadata', async () => {
    const executeManualWorkflow = vi.fn().mockResolvedValue({
      executionId: 'exec-9',
      status: 'running',
    });
    const service = buildService({ executeManualWorkflow });

    const result = await service.run('strategy-1', 'org-1', 'user-1', {
      topic: 'Launch week',
      prompt: 'Ship in public angle',
    });

    expect(result.executionId).toBe('exec-9');
    expect(result.workflowId).toBe('wf-1');
    expect(executeManualWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'user-1',
      'org-1',
      expect.objectContaining({
        angle: 'Ship in public angle',
        topic: 'Launch week',
      }),
      expect.objectContaining({
        agentStrategyId: 'strategy-1',
        createdFrom: 'agent-strategy',
      }),
      expect.anything(),
    );
  });

  it('fails closed when a required input cannot be filled', async () => {
    const service = buildService({
      findInstalled: vi.fn().mockResolvedValue([
        {
          brandId: 'brand-1',
          id: 'wf-strict',
          inputVariables: [
            {
              key: 'customRequired',
              label: 'Custom',
              required: true,
              type: 'text',
            },
          ],
          label: 'Strict',
          metadata: { sourceTemplateId: 'founder-x-post' },
          name: null,
        },
      ]),
      findOneWorkflow: vi.fn().mockResolvedValue({
        id: 'wf-strict',
        inputVariables: [
          {
            key: 'customRequired',
            label: 'Custom',
            required: true,
            type: 'text',
          },
        ],
        label: 'Strict',
        metadata: { sourceTemplateId: 'founder-x-post' },
      }),
    });

    // preferred path uses findInstalled first via resolve when no preferred id
    await expect(
      service.run('strategy-1', 'org-1', 'user-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
