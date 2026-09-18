import { ALL_ACTIONS, getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import {
  type ActionContractJsonSchema,
  compileActionContract,
} from './action-contract';

/**
 * Every published action is compiled by the engine at API bootstrap, so a single
 * unconstrained schema takes the whole process down rather than failing the one
 * workflow that uses it. Compile the catalog here instead, where the failure is
 * a red unit test naming every offender at once.
 */
describe('published action catalog', () => {
  // Compiles the full published catalog. Adding one action is cheap locally,
  // but a contended CI runner can exceed the 15s package default.
  it('compiles every action contract the engine will register', {
    timeout: 60_000,
  }, () => {
    const failures: string[] = [];
    for (const action of ALL_ACTIONS) {
      try {
        compileActionContract(action.id, {
          inputSchema: action.inputSchema as ActionContractJsonSchema,
          outputSchema: action.outputSchema as ActionContractJsonSchema,
        });
      } catch (error: unknown) {
        failures.push(
          error instanceof Error ? error.message : `${action.id}: unknown`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts an in-flight generate_image result without a CDN url', () => {
    const action = getActionDefinition('generate_image');
    expect(action).toBeDefined();
    const contract = compileActionContract('generate_image', {
      inputSchema: (action?.inputSchema ?? {}) as ActionContractJsonSchema,
      outputSchema: (action?.outputSchema ?? {}) as ActionContractJsonSchema,
    });
    const provenance = {
      nodeId: 'execute-tool',
      runId: 'run-1',
      workflowId: 'agent.tool.generate_image',
      workflowVersionId: 'v1',
    };

    expect(() =>
      contract.validateOutput(
        {
          creditsUsed: 0,
          data: { id: 'img-1', status: 'processing' },
          isBillingDelegated: true,
          nextActions: [],
          success: true,
        },
        provenance,
      ),
    ).not.toThrow();

    expect(() =>
      contract.validateOutput(
        {
          creditsUsed: 0,
          data: {
            id: 'img-1',
            status: 'processing',
            url: undefined,
          },
          isBillingDelegated: true,
          success: true,
        },
        provenance,
      ),
    ).toThrow('Action contract output validation failed');
  });
});
