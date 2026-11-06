import type { BrandRemixSceneAnalysisService } from '@api/collections/content-runs/services/brand-remix-scene-analysis.service';
import type { BrandRemixSceneAssemblyService } from '@api/collections/content-runs/services/brand-remix-scene-assembly.service';
import type { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import type { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import type { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandRemixSceneWorkflowService } from './brand-remix-scene-workflow.service';

// Only injection tokens are needed from these; keep their modules out.
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

const STEP = 'brand-remix.scene-step';

interface Stage {
  state: string;
}

interface RunConfig {
  analyzed?: boolean;
  assembled?: boolean;
  error?: string;
  phase?: string;
  scenePipeline: {
    error?: string;
    operation: {
      id: string;
      resumedAt?: string;
      sequence: number;
      startedAt: string;
      userId: string;
    };
    quote?: { operation: string };
    scenes: Record<string, { image: Stage; video: Stage }>;
    state: string;
  };
  sourcePrepared?: boolean;
}

interface QueuedJob {
  input: Record<string, unknown>;
  jobKey: string;
  options: Record<string, unknown>;
}

type Outcome = 'done' | 'error' | 'pending';

const job = (sequence = 2) => ({
  operationId: 'op',
  organizationId: 'org',
  runId: 'run',
  sequence,
});

describe('BrandRemixSceneWorkflowService', () => {
  let actions: Map<
    string,
    (request: { input: { job: unknown } }) => Promise<unknown>
  >;
  let workflows: Map<string, Record<string, unknown>>;
  let config: RunConfig;
  let queued: QueuedJob[];
  let generationOutcome: Outcome;
  let assemblyOutcome: Outcome;
  let isSourceDown: boolean;

  const step = (input: unknown) =>
    actions.get(STEP)?.({ input: { job: input } });

  beforeEach(() => {
    actions = new Map();
    workflows = new Map();
    queued = [];
    generationOutcome = 'pending';
    assemblyOutcome = 'pending';
    isSourceDown = false;
    config = {
      scenePipeline: {
        operation: {
          id: 'op',
          sequence: 2,
          startedAt: new Date().toISOString(),
          userId: 'user',
        },
        quote: { operation: 'generate' },
        scenes: {
          scene: { image: { state: 'ready' }, video: { state: 'submitted' } },
        },
        state: 'generating',
      },
    };

    const store = {
      fence: async () => ({ brandId: 'brand', config }),
      read: async () => ({ config }),
      save: async (
        _org: string,
        _run: string,
        _old: RunConfig,
        next: RunConfig,
      ) => {
        config = next;
      },
    } as unknown as BrandRemixSceneStoreService;
    const analysis = {
      step: async () => {
        config.analyzed = true;
        return true;
      },
    } as unknown as BrandRemixSceneAnalysisService;
    // Generation settles the submitted video once the provider is done; on a
    // reconcile-only pass it never claims new work.
    const generation = {
      step: async () => {
        if (generationOutcome === 'error') {
          throw new Error('probe unavailable');
        }
        if (generationOutcome === 'done') {
          config.scenePipeline.scenes.scene.video.state = 'ready';
        }
        return generationOutcome === 'done';
      },
    } as unknown as BrandRemixSceneGenerationService;
    const assembly = {
      step: async () => {
        config.assembled = assemblyOutcome === 'done';
        return assemblyOutcome === 'done';
      },
    } as unknown as BrandRemixSceneAssemblyService;
    const source = {
      prepare: async () => {
        if (isSourceDown) {
          throw new Error('Source video is gone');
        }
        config.sourcePrepared = true;
      },
    } as unknown as BrandRemixSceneSourceService;
    const queue = {
      queueSystemWorkflow: async (
        input: Record<string, unknown>,
        jobKey: string,
        options: Record<string, unknown>,
      ) => {
        queued.push({ input, jobKey, options });
      },
    } as unknown as WorkflowExecutionQueueService;
    const runner = {
      registerAction: (
        id: string,
        handler: (request: { input: { job: unknown } }) => Promise<unknown>,
      ) => {
        actions.set(id, handler);
      },
      registerWorkflow: (workflow: { canonicalId: string }) => {
        workflows.set(workflow.canonicalId, workflow);
      },
    } as unknown as SystemWorkflowRunnerService;

    new BrandRemixSceneWorkflowService(
      store,
      analysis,
      generation,
      assembly,
      source,
      queue,
      runner,
    ).onModuleInit();
  });

  const nextStep = (sequence: number, delayMs: number): QueuedJob => ({
    input: expect.objectContaining({
      actionType: STEP,
      canonicalId: STEP,
      inputValues: {
        job: {
          operationId: 'op',
          organizationId: 'org',
          runId: 'run',
          sequence,
        },
      },
      organizationId: 'org',
      source: 'brand-remix-scenes',
      userId: 'user',
    }),
    jobKey: `remix-run-op-${sequence}`,
    options: {
      attempts: 1,
      delayMs,
      dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
    },
  });

  it('registers the hidden scene step workflow around its action', async () => {
    expect(workflows.get(STEP)).toMatchObject({
      canonicalId: STEP,
      label: 'Remix scene step',
      resultNodeId: 'step',
      version: 1,
    });
    await expect(step(job())).resolves.toEqual({ handled: true });
  });

  it('rejects a malformed job before reading the run', async () => {
    await expect(step({ ...job(), extra: true })).rejects.toThrow();
    expect(queued).toEqual([]);
  });

  it('drops a job from a superseded chain without touching the run', async () => {
    const before = structuredClone(config);

    await step(job(1));

    expect(config).toEqual(before);
    expect(queued).toEqual([]);
  });

  it('schedules the next step while scene work is in flight', async () => {
    await step(job());

    expect(config.sourcePrepared).toBe(true);
    expect(config.assembled).toBeUndefined();
    expect(config.scenePipeline.operation.sequence).toBe(3);
    expect(queued).toEqual([nextStep(3, 10_000)]);
  });

  it('assembles once generation is done and stops the chain when assembled', async () => {
    generationOutcome = 'done';
    assemblyOutcome = 'done';

    await step(job());

    expect(config.assembled).toBe(true);
    expect(queued).toEqual([]);
  });

  it('runs analysis for an analysis quote', async () => {
    config.scenePipeline.quote = { operation: 'analysis' };

    await step(job());

    expect(config).toMatchObject({ analyzed: true });
    expect(config.assembled).toBeUndefined();
    expect(queued).toEqual([]);
  });

  it.each([
    [
      'a stalled operation',
      false,
      31,
      'Scene operation stalled after 30 minutes. Resume to reconcile accepted work.',
    ],
    ['a failed source', true, 0, 'Source video is gone'],
  ])(
    'marks %s as a partial failure and stops',
    async (_case, isDown, minutesAgo, error) => {
      isSourceDown = isDown;
      config.scenePipeline.operation.startedAt = new Date(
        Date.now() - minutesAgo * 60_000,
      ).toISOString();

      await step(job());

      expect(config).toMatchObject({
        phase: 'prefilled',
        scenePipeline: { error, state: 'partial_failure' },
      });
      expect(queued).toEqual([]);
    },
  );

  describe('after cancellation', () => {
    beforeEach(() => {
      config.scenePipeline.state = 'cancelled';
    });

    it('keeps reconciling accepted work without claiming new work', async () => {
      await step(job());

      expect(config.scenePipeline.scenes.scene).toEqual({
        image: { state: 'ready' },
        video: { state: 'submitted' },
      });
      expect(config.sourcePrepared).toBeUndefined();
      expect(queued).toEqual([nextStep(3, 10_000)]);
    });

    it('stops once the accepted work has drained', async () => {
      generationOutcome = 'done';

      await step(job());

      expect(config.scenePipeline.scenes.scene.video.state).toBe('ready');
      expect(queued).toEqual([]);
    });

    it('stops at once when nothing was in flight', async () => {
      config.scenePipeline.scenes.scene.video.state = 'ready';

      await step(job());

      expect(queued).toEqual([]);
    });

    it('retries the reconcile chain with a minute of backoff on an error', async () => {
      generationOutcome = 'error';

      await step(job());

      expect(config.scenePipeline.state).toBe('cancelled');
      expect(queued).toEqual([nextStep(3, 60_000)]);
    });
  });
});
