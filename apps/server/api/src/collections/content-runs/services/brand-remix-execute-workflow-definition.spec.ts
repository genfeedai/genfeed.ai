import {
  BRAND_REMIX_EXECUTE_ACTION_IDS,
  BRAND_REMIX_EXECUTE_WORKFLOW_IDS,
  buildBrandRemixExecuteWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-execute-workflow-definition';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

function actionIds(
  definition: ReturnType<typeof buildBrandRemixExecuteWorkflowDefinition>,
) {
  return definition.definition.nodes.flatMap((node) => {
    const actionId = node.data.config.actionId;
    return typeof actionId === 'string' ? [actionId] : [];
  });
}

describe('brand remix execute workflow definitions', () => {
  it('models prepare, claim, recovery, copy, media dispatch, and projection as nodes', () => {
    const definition = buildBrandRemixExecuteWorkflowDefinition();

    expect(definition.canonicalId).toBe(
      BRAND_REMIX_EXECUTE_WORKFLOW_IDS.EXECUTE,
    );
    expect(actionIds(definition)).toEqual([
      BRAND_REMIX_EXECUTE_ACTION_IDS.PREPARE,
      BRAND_REMIX_EXECUTE_ACTION_IDS.CLAIM,
      BRAND_REMIX_EXECUTE_ACTION_IDS.ADOPT_ORPHANS,
      BRAND_REMIX_EXECUTE_ACTION_IDS.GENERATE_COPY,
      BRAND_REMIX_EXECUTE_ACTION_IDS.DISPATCH_MEDIA,
      BRAND_REMIX_EXECUTE_ACTION_IDS.RECONCILE,
      BRAND_REMIX_EXECUTE_ACTION_IDS.PROJECT,
    ]);
  });

  it('backs every Brand Remix execute node with a registered action contract', () => {
    expect(
      actionIds(buildBrandRemixExecuteWorkflowDefinition()).every((actionId) =>
        getActionDefinition(actionId),
      ),
    ).toBe(true);
  });
});
