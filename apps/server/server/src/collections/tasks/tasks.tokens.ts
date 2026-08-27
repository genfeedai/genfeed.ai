/**
 * DI token aliasing {@link TasksService}.
 *
 * `TaskActionsService` and `TaskPlanningService` inject it through this token
 * instead of `@Inject(forwardRef(() => TasksService))`, so the compiled files no
 * longer reference the `TasksService` *class value* at module-evaluation time
 * (emitDecoratorMetadata would otherwise emit it into `design:paramtypes`).
 *
 * Those services and `TasksService` import each other, so that load-time value
 * reference triggered a temporal-dead-zone crash in the bundled output —
 * `ReferenceError: Cannot access 'TasksService' before initialization` — which
 * took down the `api-workflow-backfill` boot (and was a latent risk for the api
 * bundle). With `import type` + this token, the cycle has no load-time value
 * edge; DI still resolves the singleton via `useExisting` in {@link TasksModule}.
 */
export const TASKS_SERVICE = Symbol('TASKS_SERVICE');
