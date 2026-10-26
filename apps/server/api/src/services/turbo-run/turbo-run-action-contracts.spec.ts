import { getActionDefinition } from '@genfeedai/actions';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

const PROVENANCE = {
  nodeId: 'mark-queued',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

describe('turbo.run.mark-queued action contract', () => {
  const action = getActionDefinition('turbo.run.mark-queued');
  if (!action) throw new Error('Unknown action turbo.run.mark-queued');
  const contract = compileActionContract('turbo.run.mark-queued', {
    inputSchema: action.inputSchema as ActionContractJsonSchema,
    outputSchema: action.outputSchema as ActionContractJsonSchema,
  });

  it('accepts the action context an agent approval carries, generation entry included', () => {
    expect(() =>
      contract.validateInput(
        {
          request: {
            actionContext: {
              generationEntry: { kind: 'chat' },
              origin: 'agent',
            },
            organizationId: 'organization-1',
            turboRunId: 'turbo-run-1',
            userId: 'user-1',
          },
        },
        PROVENANCE,
      ),
    ).not.toThrow();
  });
});
