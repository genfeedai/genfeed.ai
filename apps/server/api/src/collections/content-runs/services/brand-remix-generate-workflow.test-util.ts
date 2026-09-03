import { BRAND_REMIX_DOWNSTREAM_ACTION_IDS } from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
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

export async function runBrandRemixGenerateWorkflow(input: {
  actions: Map<string, CapturedWorkflowAction>;
  request: RunSystemWorkflowInput;
}): Promise<{ provenance: Record<string, unknown>; result: unknown }> {
  const provenance = {
    executionId: 'generate-workflow-execution-1',
    workflowId: 'brand-remix.generate',
    workflowLabel: 'Brand Remix Generate',
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
  const ids = BRAND_REMIX_DOWNSTREAM_ACTION_IDS;
  const startRequest = input.request.inputValues?.request;
  if (startRequest === undefined) {
    throw new Error(
      'Brand remix generate workflow requires inputValues.request',
    );
  }
  let state = await execute(ids.GENERATE_CLAIM, {
    request: startRequest,
  });
  state = await execute(ids.GENERATE_ADOPT_ORPHANS, { state });
  const adopted = state as { items?: unknown[] };
  const creditBatch = {
    count: Array.isArray(adopted.items) ? adopted.items.length : 0,
    results: await Promise.all(
      (Array.isArray(adopted.items) ? adopted.items : []).map(async (item) => ({
        result: await execute(ids.GENERATE_RESOLVE_VARIANT_CREDITS, {
          item,
        }),
      })),
    ),
  };
  state = await execute(ids.GENERATE_RESERVE_CREDITS, {
    batch: creditBatch,
    state,
  });
  const reserved = state as { items?: unknown[] };
  const dispatchBatch = {
    count: Array.isArray(reserved.items) ? reserved.items.length : 0,
    results: await Promise.all(
      (Array.isArray(reserved.items) ? reserved.items : []).map(
        async (item) => ({
          result: await execute(ids.GENERATE_DISPATCH_VARIANT, { item }),
        }),
      ),
    ),
  };
  state = await execute(ids.GENERATE_RECONCILE, {
    batch: dispatchBatch,
    state,
  });
  const result = await execute(ids.GENERATE_CLEAR_CLAIM, { state });
  return { provenance, result };
}
