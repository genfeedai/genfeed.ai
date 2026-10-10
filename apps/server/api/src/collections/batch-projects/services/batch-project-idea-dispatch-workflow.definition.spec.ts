import { BatchProjectIdeaDispatchService } from '@api/collections/batch-projects/services/batch-project-idea-dispatch.service';
import {
  BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS,
  BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID,
  BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID,
  buildBatchProjectIdeaDispatchFailureWorkflowDefinition,
  buildBatchProjectIdeaDispatchWorkflowDefinition,
} from '@api/collections/batch-projects/services/batch-project-idea-dispatch-workflow.definition';
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

describe('batch project idea dispatch workflow definitions', () => {
  it('resolves every dispatch action from the shared action catalog', () => {
    for (const actionId of Object.values(
      BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS,
    )) {
      expect(getActionDefinition(actionId)).toMatchObject({
        id: actionId,
        visibility: 'internal',
      });
    }
  });

  it('builds single-action graphs over the registered actions', () => {
    expect(
      buildBatchProjectIdeaDispatchWorkflowDefinition().organizationModule,
    ).toBe('batch');
    // Exhausted-attempt projection and hold release must still run after a disable.
    expect(
      buildBatchProjectIdeaDispatchFailureWorkflowDefinition()
        .organizationModule,
    ).toBeUndefined();
    expect(
      buildBatchProjectIdeaDispatchWorkflowDefinition().definition.nodes.map(
        (node) => node.data.config.actionId,
      ),
    ).toEqual([BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH]);
    expect(
      buildBatchProjectIdeaDispatchFailureWorkflowDefinition().definition.nodes.map(
        (node) => node.data.config.actionId,
      ),
    ).toEqual([BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL]);
  });

  it('registers its actions and workflows through the real runner boot path', () => {
    const { executors, runner } = bootRunner();
    const service = new BatchProjectIdeaDispatchService(
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
    expect(executors.has(BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.DISPATCH)).toBe(
      true,
    );
    expect(executors.has(BATCH_PROJECT_IDEA_DISPATCH_ACTION_IDS.FAIL)).toBe(
      true,
    );
    expect(
      runner.getWorkflow(BATCH_PROJECT_IDEA_DISPATCH_WORKFLOW_ID),
    ).toBeDefined();
    expect(
      runner.getWorkflow(BATCH_PROJECT_IDEA_DISPATCH_FAILURE_WORKFLOW_ID),
    ).toBeDefined();
  });
});
