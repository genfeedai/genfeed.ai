import { AsyncLocalStorage } from 'node:async_hooks';

export interface WorkflowGenerationDispatchScope {
  claimId: string;
  dispatchFingerprint?: string;
  executionId: string;
  inputs: ReadonlyMap<string, unknown>;
  operationId: string;
  organizationId: string;
}

const storage = new AsyncLocalStorage<WorkflowGenerationDispatchScope>();

export function runWithWorkflowGenerationDispatch<T>(
  scope: WorkflowGenerationDispatchScope,
  callback: () => T,
): T {
  return storage.run(scope, callback);
}

export function currentWorkflowGenerationDispatch():
  | WorkflowGenerationDispatchScope
  | undefined {
  return storage.getStore();
}
