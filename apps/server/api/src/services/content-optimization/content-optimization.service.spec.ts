import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { ContentOptimizationService } from './content-optimization.service';
import { CONTENT_OPTIMIZATION_ACTION_IDS } from './content-optimization-workflow-definition';

const result = {
  optimizedPrompt: 'Better hook',
  reasoning: 'Clearer',
  suggestions: [],
  confidenceScore: 0.8,
};
const response = (content: string) => ({ choices: [{ message: { content } }] });
describe('ContentOptimizationService registered optimization action', () => {
  let completion: ReturnType<typeof vi.fn>;
  let action: (request: SystemWorkflowActionRequest) => Promise<unknown>;
  const request = {
    input: {
      request: { originalPrompt: 'Original' },
      performance: {
        topPerformers: [],
        worstPerformers: [],
        performanceContext: 'Useful context',
      },
    },
  } as unknown as SystemWorkflowActionRequest;
  beforeEach(() => {
    completion = vi.fn();
    const registerAction = vi.fn();
    new ContentOptimizationService(
      {} as never,
      {} as never,
      {} as never,
      { chatCompletion: completion } as never,
      {} as never,
      {} as never,
      { registerAction, registerWorkflow: vi.fn() } as never,
    ).onModuleInit();
    action = registerAction.mock.calls.find(
      ([id]) => id === CONTENT_OPTIMIZATION_ACTION_IDS.OPTIMIZE_PROMPT,
    )?.[1];
  });
  it('returns validated output through the registered workflow action', async () => {
    completion.mockResolvedValue(response(JSON.stringify(result)));
    expect(await action(request)).toEqual(result);
    expect(completion).toHaveBeenCalledTimes(1);
    expect(completion.mock.calls[0][0].messages[0].content).toContain(
      'Useful context',
    );
  });
  it('repairs invalid fields once with the original adapter model/options', async () => {
    const invalid = JSON.stringify({ ...result, confidenceScore: 'high' });
    completion
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(JSON.stringify(result)));
    expect(await action(request)).toEqual(result);
    for (const [body] of completion.mock.calls) {
      expect(body).toMatchObject({
        model: LLM_DEFAULTS.fastText,
        max_tokens: 1500,
        temperature: 0.7,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'prompt_optimization' },
        },
      });
    }
    expect(completion.mock.calls[1][0].messages.slice(0, 2)).toEqual(
      completion.mock.calls[0][0].messages,
    );
    expect(completion.mock.calls[1][0].messages[2]).toEqual({
      role: 'assistant',
      content: invalid,
    });
    expect(completion.mock.calls[1][0].messages[3].content).toContain(
      'confidenceScore',
    );
  });
  it.each([
    '',
    'Text {"optimizedPrompt":"fake"}',
    '{"confidenceScore":1}',
    JSON.stringify({ ...result, suggestions: [1] }),
  ])('hard fails without coercion/template for %s', async (raw) => {
    completion.mockResolvedValue(response(raw));
    await expect(action(request)).rejects.toBeInstanceOf(
      LlmStructuredOutputError,
    );
    expect(completion).toHaveBeenCalledTimes(2);
  });
  it('propagates transport errors without a repair', async () => {
    const error = new Error('transport');
    completion.mockRejectedValue(error);
    await expect(action(request)).rejects.toBe(error);
    expect(completion).toHaveBeenCalledTimes(1);
  });
});
