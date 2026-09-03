import { BRAND_REMIX_EXECUTE_ACTION_IDS } from '@api/collections/content-runs/services/brand-remix-execute-workflow-definition';
import type { RunSystemWorkflowInput } from '@api/collections/workflows/system-workflow-definition';

type CapturedWorkflowAction = (request: {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
  runtimeContext?: unknown;
}) => Promise<unknown> | unknown;

export async function runBrandRemixExecuteWorkflow(input: {
  actions: Map<string, CapturedWorkflowAction>;
  request: RunSystemWorkflowInput;
}): Promise<{ provenance: Record<string, unknown>; result: unknown }> {
  const provenance = {
    executionId: 'workflow-execution-1',
    workflowId: 'workflow-1',
    workflowLabel: 'Brand Remix Execute',
  };
  const execute = async (id: string, actionInput: Record<string, unknown>) => {
    const action = input.actions.get(id);
    if (!action) throw new Error(`Missing action ${id}`);
    return action({
      input: actionInput,
      provenance,
      runtimeContext: input.request.runtimeContext,
    });
  };

  let state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.PREPARE, {
    request: input.request.inputValues.request,
  });
  state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.CLAIM, { state });
  state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.ADOPT_ORPHANS, {
    state,
  });
  state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.GENERATE_COPY, {
    state,
  });
  state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.DISPATCH_MEDIA, {
    state,
  });
  state = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.RECONCILE, { state });
  const result = await execute(BRAND_REMIX_EXECUTE_ACTION_IDS.PROJECT, {
    state,
  });
  return { provenance, result };
}
