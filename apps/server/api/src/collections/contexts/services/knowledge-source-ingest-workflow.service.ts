import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  KnowledgeSourceIngestService,
  type KnowledgeSourceIngestState,
} from '@api/collections/contexts/services/knowledge-source-ingest.service';
import {
  buildKnowledgeSourceBackfillWorkflowDefinition,
  buildKnowledgeSourceIngestWorkflowDefinition,
  KNOWLEDGE_SOURCE_ACTION_IDS,
  KNOWLEDGE_SOURCE_WORKFLOW_IDS,
} from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import {
  knowledgeWorkflowActorKey,
  toKnowledgeWorkflowActor,
  validateKnowledgeWorkflowAction,
} from '@api/collections/contexts/utils/knowledge-workflow-actor.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/contracts/interfaces';
import type { KnowledgeWorkflowInitiatingActor } from '@genfeedai/contracts/interfaces/automation/content-delivery-workflow.interface';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Injectable, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class KnowledgeSourceIngestWorkflowService implements OnModuleInit {
  constructor(
    private readonly ingest: KnowledgeSourceIngestService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.LOAD,
      async (action) => {
        const request = await this.admit(
          action,
          KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
          action.input.request,
        );
        return this.ingest.loadSource(request);
      },
    );
    for (const [actionId, run] of [
      [
        KNOWLEDGE_SOURCE_ACTION_IDS.MARK,
        (state: KnowledgeSourceIngestState) => this.ingest.markSource(state),
      ],
      [
        KNOWLEDGE_SOURCE_ACTION_IDS.EXTRACT,
        (state: KnowledgeSourceIngestState) => this.ingest.extractSource(state),
      ],
      [
        KNOWLEDGE_SOURCE_ACTION_IDS.CHUNK,
        (state: KnowledgeSourceIngestState) => this.ingest.chunkSource(state),
      ],
      [
        KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE,
        (state: KnowledgeSourceIngestState) => this.ingest.replaceChunks(state),
      ],
    ] as const) {
      this.runner.registerAction(actionId, async (action) => {
        const state = action.input.state as KnowledgeSourceIngestState;
        const request = await this.admit(
          action,
          KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
          state,
        );
        return run({ ...state, initiatingActor: request.initiatingActor });
      });
    }
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE,
      async (action) => {
        const failure = action.input.failure as
          | { error?: string; nodeOutputs?: Record<string, unknown> }
          | undefined;
        const state =
          (action.input.state as KnowledgeSourceIngestState | undefined) ??
          this.lastIngestState(failure?.nodeOutputs);
        const request = await this.admit(
          action,
          KNOWLEDGE_SOURCE_WORKFLOW_IDS.INGEST,
          state,
        );
        return this.ingest.finalizeSource(
          state
            ? { ...state, initiatingActor: request.initiatingActor }
            : undefined,
          failure?.error,
        );
      },
    );
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.DISCOVER_BACKFILL,
      async (action) => {
        const request = await this.admit(
          action,
          KNOWLEDGE_SOURCE_WORKFLOW_IDS.BACKFILL,
          action.input.request,
        );
        const scan = await this.ingest.scanForBackfill(request);
        return { items: scan.queued };
      },
    );
    this.runner.registerWorkflow(
      buildKnowledgeSourceIngestWorkflowDefinition(),
    );
    this.runner.registerWorkflow(
      buildKnowledgeSourceBackfillWorkflowDefinition(),
    );
  }

  private admit(
    action: SystemWorkflowActionRequest,
    canonicalId: string,
    input: unknown,
  ) {
    return validateKnowledgeWorkflowAction(
      this.prisma,
      this.brandAccess,
      action,
      canonicalId,
      input,
    );
  }

  private lastIngestState(
    outputs: Record<string, unknown> | undefined,
  ): KnowledgeSourceIngestState | undefined {
    if (!outputs) return undefined;
    for (const nodeId of [
      'replace-chunks',
      'chunk-source',
      'extract-source',
      'mark-source',
      'load-source',
    ]) {
      const state = outputs[nodeId];
      if (state && typeof state === 'object') {
        return state as KnowledgeSourceIngestState;
      }
    }
    return undefined;
  }

  enqueueIngest(
    input: KnowledgeSourceIngestWorkflowInput & {
      initiatingActor: KnowledgeWorkflowInitiatingActor;
    },
  ): Promise<string> {
    const request = {
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      versionId: input.versionId,
      initiatingActor: toKnowledgeWorkflowActor(input.initiatingActor),
    };
    const definition = buildKnowledgeSourceIngestWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        userId: request.initiatingActor.userId,
        source: 'knowledge-source',
      },
      `knowledge-source-ingest-${request.sourceId}-${request.versionId}`,
      {
        attempts: 3,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      },
    );
  }

  enqueueBackfill(
    input: KnowledgeSourceBackfillWorkflowInput & {
      initiatingActor: KnowledgeWorkflowInitiatingActor;
    },
  ): Promise<string> {
    const request = {
      organizationId: input.organizationId,
      initiatingActor: toKnowledgeWorkflowActor(input.initiatingActor),
    };
    const definition = buildKnowledgeSourceBackfillWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        userId: request.initiatingActor.userId,
        source: 'knowledge-source-backfill',
      },
      `knowledge-source-backfill-${request.organizationId}-${knowledgeWorkflowActorKey(request.initiatingActor)}`,
      {
        attempts: 1,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      },
    );
  }
}
