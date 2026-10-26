import { toActionJsonOutput } from '@api/services/agent-orchestrator/utils/agent-action-output.util';
import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

const PROVENANCE = {
  nodeId: 'execute',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

function contractFor(actionId: string) {
  const action = getActionDefinition(actionId);
  if (!action) throw new Error(`Unknown action ${actionId}`);
  return compileActionContract(actionId, {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });
}

describe('toActionJsonOutput', () => {
  it('drops undefined fields so the ui-action output contract accepts the result', () => {
    const contract = contractFor('agent.thread.ui-action.execute');
    const result = {
      creditsRemaining: 90,
      creditsUsed: 88,
      message: {
        content: 'Approved action completed.',
        metadata: {
          totalCreditsUsed: 88,
          uiBlocks: { blockIds: undefined, operation: 'upsert' },
        },
        role: 'assistant',
      },
      threadId: 'thread-1',
      toolCalls: [{ error: undefined, status: 'completed', toolName: 'x' }],
    };

    expect(() => contract.validateOutput(result, PROVENANCE)).toThrow();
    expect(() =>
      contract.validateOutput(toActionJsonOutput(result), PROVENANCE),
    ).not.toThrow();
  });

  it('keeps values a JSON document can hold', () => {
    expect(
      toActionJsonOutput({ a: [1, 'b', null], c: { d: true }, e: undefined }),
    ).toEqual({ a: [1, 'b', null], c: { d: true } });
  });
});
