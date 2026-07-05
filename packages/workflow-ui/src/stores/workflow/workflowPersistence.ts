import type { WorkflowPersistenceService } from './types';

// =============================================================================
// Module-level workflow persistence configuration
// =============================================================================

/**
 * Injected persistence backend for the workflow store's CRUD actions
 * (`saveWorkflow`, `loadWorkflowById`, `listWorkflows`, `deleteWorkflow`,
 * `duplicateWorkflowApi`, `createNewWorkflow`).
 *
 * The workflow store is a plain Zustand store outside the React tree, so the
 * service is registered at module scope via {@link configureWorkflowPersistence}
 * — the same pattern the execution HTTP client and logger use.
 *
 * When unconfigured, every method throws a clear "not configured" error. This
 * preserves the package's prior standalone behavior (the stubs threw
 * "not implemented") — a save must never silently no-op and drop the user's work.
 */
function notConfigured(method: string): never {
  throw new Error(
    `WorkflowPersistenceService.${method} is not configured — the consuming app must inject workflowPersistence via WorkflowUIConfig`,
  );
}

const DEFAULT_PERSISTENCE: WorkflowPersistenceService = {
  create: async () => notConfigured('create'),
  delete: async () => notConfigured('delete'),
  duplicate: async () => notConfigured('duplicate'),
  getAll: async () => notConfigured('getAll'),
  getById: async () => notConfigured('getById'),
  update: async () => notConfigured('update'),
};

let _persistence: WorkflowPersistenceService = DEFAULT_PERSISTENCE;

/**
 * Register the persistence backend the workflow store delegates to.
 * Called by WorkflowUIProvider; resets to the throwing default when unset.
 */
export function configureWorkflowPersistence(
  service: WorkflowPersistenceService | undefined,
): void {
  _persistence = service ?? DEFAULT_PERSISTENCE;
}

/** Read the currently-configured persistence backend (throws until configured). */
export function getWorkflowPersistence(): WorkflowPersistenceService {
  return _persistence;
}
