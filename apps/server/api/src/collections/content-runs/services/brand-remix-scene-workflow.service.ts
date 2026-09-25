import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { BrandRemixSceneAnalysisService } from '@api/collections/content-runs/services/brand-remix-scene-analysis.service';
import { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import { BrandRemixSceneAssemblyService } from '@api/collections/content-runs/services/brand-remix-scene-assembly.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
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
          job: { organizationId, runId, operationId: operation.id },
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
          'Scene operation stalled after 30 minutes. Reconcile accepted work before continuing.',
        );
      await this.source.prepare(organizationId, brandId, config);
      const complete =
        pipeline.quote?.operation === 'analysis'
          ? await this.analysis.step(organizationId, runId, operationId)
          : (await this.generation.step(organizationId, runId, operationId)) &&
            (await this.assembly.step(organizationId, runId, operationId));
      if (complete) return;
      const current = await this.store.fence(
        organizationId,
        runId,
        operationId,
      );
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
      await this.enqueue(organizationId, runId, operation, 10_000);
    } catch (error: unknown) {
      const current = await this.store.read(organizationId, runId);
      const pipeline = current.config.scenePipeline;
      if (
        pipeline?.operation?.id !== operationId ||
        pipeline.state === 'cancelled'
      )
        return;
      await this.store.save(organizationId, runId, current.config, {
        ...current.config,
        phase: 'prefilled',
        scenePipeline: {
          ...pipeline,
          state: 'partial_failure',
          error:
            error instanceof Error
              ? error.message
              : 'Scene processing failed; reconcile accepted work before retrying.',
        },
      });
    }
  }
}
