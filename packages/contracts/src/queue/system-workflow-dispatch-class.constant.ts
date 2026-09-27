/**
 * Where a `SystemWorkflowRunnerService.enqueueWorkflow` /
 * `WorkflowExecutionQueueService.queueSystemWorkflow` producer's dispatch
 * belongs. Required on every call (#5271) so a new producer cannot land
 * without an explicit choice — `check-workflow-dispatch-class.ts` and the
 * TypeScript compiler both fail closed on a missing one.
 */
export enum SystemWorkflowDispatchClass {
  /**
   * A direct user- or agent-initiated turn: an HTTP request handling a live
   * action, or a live agent-conversation turn. Stays on
   * `WORKFLOW_EXECUTION_QUEUE`, which is reserved for these so a background
   * burst can never delay one.
   */
  INTERACTIVE = 'interactive',
  /**
   * Everything else: worker crons, batch/background fan-out, webhook-
   * triggered ingestion, polling reconciliation. Routes to
   * `WORKFLOW_BACKGROUND_QUEUE` — or, when the dispatch's `source` identifies
   * one of the three platform-cron sweep workflows (#5162), to the even more
   * isolated `PLATFORM_SYSTEM_WORKFLOW_QUEUE` instead.
   */
  BACKGROUND = 'background',
}
