import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { TaskDecompositionService } from '@api/services/task-orchestration/task-decomposition.service';
import { AgentType } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TaskDecompositionService', () => {
  let llmDispatcher: { completeStructured: ReturnType<typeof vi.fn> };
  let service: TaskDecompositionService;

  beforeEach(() => {
    llmDispatcher = { completeStructured: vi.fn() };
    service = new TaskDecompositionService(llmDispatcher as never);
  });

  it('asks for the decomposition schema and returns the ordered subtasks', async () => {
    llmDispatcher.completeStructured.mockResolvedValue({
      routingSummary: 'Split into a script and a video.',
      subtasks: [
        {
          agentType: AgentType.VIDEO_CREATOR,
          brief: 'Cut the reel',
          label: 'Reel',
          order: 1,
        },
        {
          agentType: AgentType.ADS_SCRIPT_WRITER,
          brief: 'Write the script',
          label: 'Script',
          order: 0,
        },
      ],
    });

    const result = await service.decompose(
      { request: 'Make me a launch reel' },
      'org_1',
    );

    expect(result.subtasks.map((subtask) => subtask.label)).toEqual([
      'Script',
      'Reel',
    ]);
    expect(result.isSingleAgent).toBe(false);
    expect(result.routingSummary).toBe('Split into a script and a video.');

    const [params, organizationId] = llmDispatcher.completeStructured.mock
      .calls[0] as [
      { messages: Array<{ content: string }>; schemaName: string },
      string,
    ];
    expect(params.schemaName).toBe('task_decomposition');
    expect(organizationId).toBe('org_1');
    expect(params.messages[0].content).not.toContain('valid JSON');
  });

  it('derives isSingleAgent from the subtask list, not from the model', async () => {
    llmDispatcher.completeStructured.mockResolvedValue({
      routingSummary: 'One specialist covers this.',
      subtasks: [
        {
          agentType: AgentType.X_CONTENT,
          brief: 'Draft the thread',
          label: 'Thread',
          order: 0,
        },
      ],
    });

    const result = await service.decompose({ request: 'Thread about launch' });

    expect(result.isSingleAgent).toBe(true);
  });

  it('surfaces the typed error when the model misses the schema twice', async () => {
    const error = new LlmStructuredOutputError('task_decomposition', [
      {
        code: 'invalid_value',
        message: 'Invalid option',
        path: 'subtasks.0.agentType',
      },
    ]);
    llmDispatcher.completeStructured.mockRejectedValue(error);

    await expect(service.decompose({ request: 'anything' })).rejects.toBe(
      error,
    );
  });
});
