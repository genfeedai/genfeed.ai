import { BrandRemixSceneAnalysisService } from '@api/collections/content-runs/services/brand-remix-scene-analysis.service';
import { BrandRemixSceneAssemblyService } from '@api/collections/content-runs/services/brand-remix-scene-assembly.service';
import { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import { hasInFlightSceneGeneration } from '@api/collections/content-runs/services/brand-remix-scene-state';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { BrandRemixScenePipeline } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

const STEP = 'brand-remix.scene-step';
const jobSchema = z
  .object({
    organizationId: z.string().min(1),
    runId: z.string().min(1),
    operationId: z.string().min(1),
    sequence: z.number().int().nonnegative().optional(),
  })
  .strict();
@Injectable()
export class BrandRemixSceneWorkflowService implements OnModuleInit {
  constructor(
    private readonly store: BrandRemixSceneStoreService,
    private readonly analysis: BrandRemixSceneAnalysisService,
    private readonly generation: BrandRemixSceneGenerationService,
    private readonly assembly: BrandRemixSceneAssemblyService,
    private readonly source: BrandRemixSceneSourceService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}
  onModuleInit() {
    this.runner.registerAction(STEP, async (request) => {
      await this.step(jobSchema.parse(request.input.job));
      return { handled: true };
    });
    this.runner.registerWorkflow({
      canonicalId: STEP,
      label: 'Remix scene step',
      description: 'Reconcile and dispatch one accepted scene stage.',
      version: 1,
      resultNodeId: 'step',
      definition: {
        edges: [],
        inputVariables: [
          {
            key: 'job',
            label: 'Scoped scene operation',
            required: true,
            type: 'json',
          },
        ],
        nodes: [
          createGenfeedActionNode({
            actionId: STEP,
            id: 'step',
            inputVariableKeys: ['job'],
            position: { x: 0, y: 0 },
          }),
        ],
      },
    });
  }
  async enqueue(
    organizationId: string,
    runId: string,
    operation: NonNullable<BrandRemixScenePipeline['operation']>,
    delayMs = 0,
  ) {
    return this.queue.queueSystemWorkflow(
      {
        actionType: STEP,
        canonicalId: STEP,
        inputValues: {
          job: {
            organizationId,
            runId,
            operationId: operation.id,
            sequence: operation.sequence,
          },
        },
        organizationId,
        userId: operation.userId,
        source: 'brand-remix-scenes',
      },
      `remix-${runId}-${operation.id}-${operation.sequence}`,
      { attempts: 1, delayMs },
    );
  }
  private async step(job: z.infer<typeof jobSchema>) {
    const { organizationId, runId, operationId } = job;
    const { config: initial } = await this.store.read(organizationId, runId);
    const owner = initial.scenePipeline?.operation;
    // A job from a superseded chain (resume or cancel advanced the sequence)
    // exits so one operation never runs two concurrent step chains.
    if (
      owner?.id !== operationId ||
      (job.sequence !== undefined && owner.sequence !== job.sequence)
    )
      return;
    if (initial.scenePipeline?.state === 'cancelled') {
      await this.reconcileCancelled(organizationId, runId, operationId);
      return;
    }
    try {
      const { config, brandId } = await this.store.fence(
        organizationId,
        runId,
        operationId,
      );
      const pipeline = config.scenePipeline;
      if (!pipeline?.operation) return;
      if (
        Date.now() -
          Date.parse(
            pipeline.operation.resumedAt ?? pipeline.operation.startedAt,
          ) >
        30 * 60_000
      )
        throw new Error(
          'Scene operation stalled after 30 minutes. Resume to reconcile accepted work.',
        );
      await this.source.prepare(organizationId, brandId, config);
      const complete =
        pipeline.quote?.operation === 'analysis'
          ? await this.analysis.step(organizationId, runId, operationId)
          : (await this.generation.step(organizationId, runId, operationId)) &&
            (await this.assembly.step(organizationId, runId, operationId));
      if (complete) return;
      await this.scheduleNext(organizationId, runId, operationId, false);
    } catch (error: unknown) {
      const current = await this.store.read(organizationId, runId);
      const pipeline = current.config.scenePipeline;
      if (pipeline?.operation?.id !== operationId) return;
      // Cancellation already started its own reconcile chain.
      if (pipeline.state === 'cancelled') return;
      await this.store.save(organizationId, runId, current.config, {
        ...current.config,
        phase: 'prefilled',
        scenePipeline: {
          ...pipeline,
          state: 'partial_failure',
          error:
            error instanceof Error
              ? error.message.slice(0, 4_000)
              : 'Scene processing failed; reconcile accepted work before retrying.',
        },
      });
    }
  }
  /**
   * After cancellation, keep polling provider work that was already accepted
   * so its output and cost are recorded, without claiming anything new.
   */
  private async reconcileCancelled(
    organizationId: string,
    runId: string,
    operationId: string,
  ) {
    const { config } = await this.store.read(organizationId, runId);
    if (!hasInFlightSceneGeneration(config.scenePipeline)) return;
    let isDrained = false;
    let delayMs = 10_000;
    try {
      isDrained = await this.generation.step(
        organizationId,
        runId,
        operationId,
        { reconcileOnly: true },
      );
    } catch {
      // A transient read, probe or compare-and-swap failure must not end
      // the only chain that records accepted work; retry with backoff.
      delayMs = 60_000;
    }
    if (!isDrained)
      await this.scheduleNext(
        organizationId,
        runId,
        operationId,
        true,
        delayMs,
      );
  }
  private async scheduleNext(
    organizationId: string,
    runId: string,
    operationId: string,
    isCancelled: boolean,
    delayMs = 10_000,
  ) {
    const current = await this.store.fence(organizationId, runId, operationId, {
      allowCancelled: isCancelled,
    });
    const saved = current.config.scenePipeline;
    if (!saved?.operation) return;
    const operation = {
      ...saved.operation,
      sequence: saved.operation.sequence + 1,
    };
    await this.store.save(organizationId, runId, current.config, {
      ...current.config,
      scenePipeline: { ...saved, operation },
    });
    await this.enqueue(organizationId, runId, operation, delayMs);
  }
}
