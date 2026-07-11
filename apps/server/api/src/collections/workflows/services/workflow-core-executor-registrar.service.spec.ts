import { WorkflowCoreExecutorRegistrarService } from '@api/collections/workflows/services/workflow-core-executor-registrar.service';
import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowEngine } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

/**
 * Registration regression guard for #481.
 *
 * The `brand` node has a real executor (`createBrandExecutor`) that was never
 * wired into any registrar — unlike its siblings `brandAsset` / `brandContext`.
 * A `brand` node therefore failed at runtime with "No executor registered".
 * This asserts the brand-scoped executors are registered when a BrandsService
 * is available, and skipped when it is not.
 */
describe('WorkflowCoreExecutorRegistrarService', () => {
  // Registration only needs wrapEngineExecutor to return a NodeExecutor; the
  // wrapped executor is never invoked in these tests.
  const helper = {
    wrapEngineExecutor: () => async () => ({}),
  } as unknown as WorkflowEngineExecutorHelperService;

  const logger = {
    debug: () => {},
    error: () => {},
    log: () => {},
    warn: () => {},
  } as never;

  function register(brandsService?: unknown): string[] {
    const engine = new WorkflowEngine();
    new WorkflowCoreExecutorRegistrarService(
      helper,
      logger,
      brandsService as never,
    ).register(engine);
    return engine.getRegisteredNodeTypes();
  }

  it('registers brand-scoped executors when BrandsService is available', () => {
    const registered = register({ findOne: async () => null });

    expect(registered).toContain('brand');
    expect(registered).toContain('brandAsset');
    expect(registered).toContain('brandContext');
    expect(registered).toContain('analyticsFeedback');
  });

  it('skips brand-scoped executors when BrandsService is absent', () => {
    const registered = register(undefined);

    expect(registered).not.toContain('brand');
    expect(registered).not.toContain('brandAsset');
    expect(registered).not.toContain('brandContext');
  });
});
