import { TurboProjectIdeaDispatchService } from '@api/collections/turbo-projects/services/turbo-project-idea-dispatch.service';
import {
  buildTurboProjectIdeaDispatchFailureWorkflowDefinition,
  buildTurboProjectIdeaDispatchWorkflowDefinition,
  TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS,
  TURBO_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
  TURBO_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
} from '@api/collections/turbo-projects/services/turbo-project-idea-dispatch-workflow.definition';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { getActionDefinition } from '@genfeedai/actions';
import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

/**
 * The dispatch service registers its actions and hidden workflows during
 * `onModuleInit`, so an action id missing from the shared catalog aborts the
 * whole API boot. This spec runs the real runner through that boot path.
 */
function bootRunner() {
  const executors = new Map<string, NodeExecutor>();
  const adapter = {
    getRegisteredActionIds: () => [...executors.keys()],
    registerExecutor: (actionId: string, executor: NodeExecutor) => {
      executors.set(actionId, executor);
    },
  };
  const runner = new SystemWorkflowRunnerService(
    {} as never,
    { get: () => adapter } as never,
  );
  runner.onModuleInit();
  return { executors, runner };
}

describe('Turbo project idea dispatch workflow definitions', () => {
  it('resolves every dispatch action from the shared action catalog', () => {
    for (const actionId of Object.values(
      TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS,
    )) {
      expect(getActionDefinition(actionId)).toMatchObject({
        id: actionId,
        visibility: 'internal',
      });
    }
  });

  it('builds single-action graphs over the registered actions', () => {
    expect(
      buildTurboProjectIdeaDispatchWorkflowDefinition().organizationModule,
    ).toBe('turboRun');
    // Exhausted-attempt projection and hold release must still run after a disable.
    expect(
      buildTurboProjectIdeaDispatchFailureWorkflowDefinition()
        .organizationModule,
    ).toBeUndefined();
    expect(
      buildTurboProjectIdeaDispatchWorkflowDefinition().definition.nodes.map(
        (node) => node.data.config.actionId,
      ),
    ).toEqual([TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH]);
    expect(
      buildTurboProjectIdeaDispatchFailureWorkflowDefinition().definition.nodes.map(
        (node) => node.data.config.actionId,
      ),
    ).toEqual([TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL]);
  });

  it('registers its actions and workflows through the real runner boot path', () => {
    const { executors, runner } = bootRunner();
    const service = new TurboProjectIdeaDispatchService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner,
    );

    expect(() => service.onModuleInit()).not.toThrow();
    expect(() => runner.onApplicationBootstrap()).not.toThrow();
    expect(executors.has(TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH)).toBe(
      true,
    );
    expect(executors.has(TURBO_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL)).toBe(
      true,
    );
    expect(
      runner.getWorkflow(TURBO_PROJECT_IDEA_DISPATCH_WORKFLOW_ID),
    ).toBeDefined();
    expect(
      runner.getWorkflow(TURBO_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID),
    ).toBeDefined();
  });
});
