import { ALL_ACTIONS } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';
import { compileActionContract } from './action-contract';

/**
 * Every published action is compiled by the engine at API bootstrap, so a single
 * unconstrained schema takes the whole process down rather than failing the one
 * workflow that uses it. Compile the catalog here instead, where the failure is
 * a red unit test naming every offender at once.
 */
describe('published action catalog', () => {
  it('compiles every action contract the engine will register', () => {
    const failures: string[] = [];
    for (const action of ALL_ACTIONS) {
      try {
        compileActionContract(action.id, {
          inputSchema: action.inputSchema,
          outputSchema: action.outputSchema,
        });
      } catch (error: unknown) {
        failures.push(
          error instanceof Error ? error.message : `${action.id}: unknown`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
