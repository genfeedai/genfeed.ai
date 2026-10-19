import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';
import type { AgentChatResult } from './interfaces/agent-chat.interface';

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

// The requests `AgentOrchestratorService` queues stamp the caller's
// generation entry and initiating principal next to the caller's own fields.
const ORIGIN = {
  generationEntry: { kind: 'chat' },
  initiatingPrincipal: { kind: 'user', userId: 'user-1' },
};

describe('agent thread action contracts', () => {
  describe('agent.thread.ui-action.execute', () => {
    const contract = contractFor('agent.thread.ui-action.execute');

    it('accepts the request the orchestrator queues', () => {
      expect(() =>
        contract.validateInput(
          {
            request: {
              action: 'confirm_generate_media',
              brandId: null,
              expectedContextVersion: 3,
              payload: { sourceId: 'source-1' },
              threadId: 'thread-1',
              ...ORIGIN,
            },
          },
          PROVENANCE,
        ),
      ).not.toThrow();
    });

    it('accepts the AgentChatResult the handler returns', () => {
      const result: AgentChatResult = {
        brandId: 'brand-1',
        contextVersion: 4,
        creditsRemaining: 90,
        creditsUsed: 10,
        message: {
          content: 'Done',
          metadata: { totalCreditsUsed: 10 },
          role: 'assistant',
        },
        runOutcome: { error: 'Provider failed', status: 'failed' },
        threadId: 'thread-1',
        toolCalls: [
          {
            creditsUsed: 10,
            durationMs: 1200,
            status: 'completed',
            toolName: 'generate_image',
          },
        ],
      };
      expect(() => contract.validateOutput(result, PROVENANCE)).not.toThrow();
    });

    it('still rejects unknown request fields', () => {
      expect(() =>
        contract.validateInput(
          { request: { action: 'a', threadId: 't', unexpected: true } },
          PROVENANCE,
        ),
      ).toThrow('Action contract input validation failed');
    });
  });

  describe('agent.thread.input-response.execute', () => {
    const contract = contractFor('agent.thread.input-response.execute');

    it('accepts the request the orchestrator queues', () => {
      expect(() =>
        contract.validateInput(
          {
            request: {
              answer: 'weekly',
              fieldId: 'schedule',
              scope: { kind: 'organization' },
              threadId: 'thread-1',
              ...ORIGIN,
            },
          },
          PROVENANCE,
        ),
      ).not.toThrow();
    });

    it('accepts the resume outcome the handler returns', () => {
      expect(() =>
        contract.validateOutput(
          { resumed: true, threadId: 'thread-1' },
          PROVENANCE,
        ),
      ).not.toThrow();
      expect(() => contract.validateOutput(true, PROVENANCE)).toThrow(
        'Action contract output validation failed',
      );
    });
  });
});
