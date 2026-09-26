import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandRemixSceneWorkflowService } from './brand-remix-scene-workflow.service';

vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-store.service',
  () => ({ BrandRemixSceneStoreService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-analysis.service',
  () => ({ BrandRemixSceneAnalysisService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-generation.service',
  () => ({ BrandRemixSceneGenerationService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-assembly.service',
  () => ({ BrandRemixSceneAssemblyService: class {} }),
);
vi.mock(
  '@api/collections/content-runs/services/brand-remix-scene-source.service',
  () => ({ BrandRemixSceneSourceService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/workflow-execution-queue.service',
  () => ({ WorkflowExecutionQueueService: class {} }),
);
vi.mock('@api/collections/workflows/system-workflow-runner.service', () => ({
  SystemWorkflowRunnerService: class {},
}));

describe('scene workflow registration', () => {
  it('registers the hidden scene step action and workflow', () => {
    const runner = { registerAction: vi.fn(), registerWorkflow: vi.fn() };
    const service = new BrandRemixSceneWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner as unknown as SystemWorkflowRunnerService,
    );
    service.onModuleInit();
    expect(runner.registerAction).toHaveBeenCalledWith(
      'brand-remix.scene-step',
      expect.any(Function),
    );
    expect(runner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'brand-remix.scene-step' }),
    );
  });
});

describe('scene step chain ownership', () => {
  const store = { read: vi.fn(), fence: vi.fn(), save: vi.fn() };
  const analysis = { step: vi.fn() };
  const generation = { step: vi.fn() };
  const assembly = { step: vi.fn() };
  const source = { prepare: vi.fn() };
  const queue = { queueSystemWorkflow: vi.fn() };
  let config: {
    scenePipeline: {
      state: string;
      operation: { id: string; sequence: number; userId: string };
      scenes: Record<string, unknown>;
    };
  };
  let step: (job: unknown) => Promise<unknown>;
  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      scenePipeline: {
        state: 'generating',
        operation: { id: 'op', sequence: 2, userId: 'user' },
        scenes: {
          scene: {
            image: { state: 'ready' },
            video: { state: 'submitted' },
          },
        },
      },
    };
    store.read.mockImplementation(async () => ({ config }));
    store.fence.mockImplementation(async () => ({ config }));
    store.save.mockImplementation(async (_org, _run, _old, next) => {
      config = next;
    });
    const runner = {
      registerAction: vi.fn((_id, handler) => {
        step = (job) => handler({ input: { job } });
      }),
      registerWorkflow: vi.fn(),
    };
    new BrandRemixSceneWorkflowService(
      store as never,
      analysis as never,
      generation as never,
      assembly as never,
      source as never,
      queue as never,
      runner as unknown as SystemWorkflowRunnerService,
    ).onModuleInit();
  });
  it('drops a job from a superseded chain without touching the run', async () => {
    await step({
      organizationId: 'org',
      runId: 'run',
      operationId: 'op',
      sequence: 1,
    });
    expect(generation.step).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('keeps reconciling accepted work after cancellation without dispatching', async () => {
    config.scenePipeline.state = 'cancelled';
    generation.step.mockResolvedValue(false);
    await step({
      organizationId: 'org',
      runId: 'run',
      operationId: 'op',
      sequence: 2,
    });
    expect(generation.step).toHaveBeenCalledWith('org', 'run', 'op', {
      reconcileOnly: true,
    });
    expect(store.fence).toHaveBeenCalledWith('org', 'run', 'op', {
      allowCancelled: true,
    });
    expect(assembly.step).not.toHaveBeenCalled();
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          job: {
            organizationId: 'org',
            runId: 'run',
            operationId: 'op',
            sequence: 3,
          },
        },
      }),
      'remix-run-op-3',
      { attempts: 1, delayMs: 10_000 },
    );
  });
  it('schedules the next sequenced step while scene work is in flight', async () => {
    config.scenePipeline.operation = {
      ...config.scenePipeline.operation,
      startedAt: new Date().toISOString(),
    } as never;
    (config.scenePipeline as { quote?: unknown }).quote = {
      operation: 'generate',
    };
    generation.step.mockResolvedValue(false);
    await step({
      organizationId: 'org',
      runId: 'run',
      operationId: 'op',
      sequence: 2,
    });
    expect(assembly.step).not.toHaveBeenCalled();
    expect(config.scenePipeline.operation.sequence).toBe(3);
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      'remix-run-op-3',
      { attempts: 1, delayMs: 10_000 },
    );
  });
  it('retries the reconcile chain with backoff instead of stopping on an error', async () => {
    config.scenePipeline.state = 'cancelled';
    generation.step.mockRejectedValue(new Error('probe unavailable'));
    await step({
      organizationId: 'org',
      runId: 'run',
      operationId: 'op',
      sequence: 2,
    });
    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      'remix-run-op-3',
      { attempts: 1, delayMs: 60_000 },
    );
  });
});
