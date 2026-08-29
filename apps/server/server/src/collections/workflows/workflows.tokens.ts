/**
 * DI token aliasing {@link SystemWorkflowRunnerService}.
 *
 * `AgentAutopilotWorkflowService` injects the runner through this token instead
 * of the class value. The runner imports `WorkflowEngineAdapterService`, which
 * imports the autopilot service — so a class-value reference in
 * `design:paramtypes` (emitDecoratorMetadata) closed a load-time import cycle
 * and left the autopilot constructor param `undefined` at runtime.
 *
 * With `import type` + this token the cycle has no value edge; DI still
 * resolves the same singleton via `useExisting` in the modules that provide the
 * runner.
 */
export const SYSTEM_WORKFLOW_RUNNER = Symbol('SYSTEM_WORKFLOW_RUNNER');

/**
 * DI token aliasing {@link SystemWorkflowCatalogService}.
 *
 * The catalog injects `WorkflowsService`, and `WorkflowsService` resolves the
 * catalog back lazily through `ModuleRef`. Using the class as the lookup token
 * kept a load-time value edge between the two files; this symbol removes it
 * while `useExisting` keeps both sides on the same singleton.
 */
export const SYSTEM_WORKFLOW_CATALOG = Symbol('SYSTEM_WORKFLOW_CATALOG');

/**
 * DI token aliasing {@link WorkflowEngineAdapterService}.
 *
 * The adapter pulls in every executor registrar, and those registrars reach
 * domain services that resolve the runner back. Looking the adapter up by its
 * class value made `system-workflow-runner.service.ts` a member of that import
 * loop; the symbol keeps the lazy `ModuleRef` lookup without the value edge.
 */
export const WORKFLOW_ENGINE_ADAPTER = Symbol('WORKFLOW_ENGINE_ADAPTER');

/**
 * DI token aliasing {@link WorkflowExecutorService}.
 *
 * Same loop as {@link WORKFLOW_ENGINE_ADAPTER}: the executor imports the
 * adapter, the graph runner, and the review gate, all of which lead back to the
 * runner. The runner resolves the executor lazily, so a token is enough.
 */
export const WORKFLOW_EXECUTOR = Symbol('WORKFLOW_EXECUTOR');
