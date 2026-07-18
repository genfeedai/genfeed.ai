import type { WorkflowUILogger } from '../provider/types';

// =============================================================================
// Module-level logger configuration
// =============================================================================

/**
 * Injected logger for the execution store and its SSE handlers.
 *
 * The execution store and `sseSubscription` helpers live outside the React
 * tree (plain Zustand + EventSource callbacks) and cannot read the
 * WorkflowUIProvider context directly, so the logger is registered at module
 * scope via {@link configureWorkflowLogger} — the same pattern the prompt
 * library uses.
 *
 * Defaults to a no-op so the package stays usable standalone; the consuming
 * app injects a real (e.g. Sentry-backed) logger through `WorkflowUIConfig`.
 */
const NOOP_LOGGER: WorkflowUILogger = {
  error: () => {},
};

let _logger: WorkflowUILogger = NOOP_LOGGER;

/**
 * Register the logger the execution store reports failures through.
 * Called by WorkflowUIProvider when a `logger` is provided in the config.
 */
export function configureWorkflowLogger(
  logger: WorkflowUILogger | undefined,
): void {
  _logger = logger ?? NOOP_LOGGER;
}

/** Read the currently-configured logger (no-op until configured). */
export function getWorkflowLogger(): WorkflowUILogger {
  return _logger;
}
