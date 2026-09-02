import {
  KnowledgeSourceIngestService,
  type KnowledgeSourceIngestState,
} from '@api/collections/contexts/services/knowledge-source-ingest.service';
import {
  buildKnowledgeSourceBackfillWorkflowDefinition,
  buildKnowledgeSourceIngestWorkflowDefinition,
  KNOWLEDGE_SOURCE_ACTION_IDS,
} from '@api/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

@Injectable()
export class KnowledgeSourceIngestWorkflowService implements OnModuleInit {
  constructor(
    private readonly ingest: KnowledgeSourceIngestService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(KNOWLEDGE_SOURCE_ACTION_IDS.LOAD, ({ input }) =>
      this.ingest.loadSource(
        input.request as KnowledgeSourceIngestWorkflowInput,
      ),
    );
    this.runner.registerAction(KNOWLEDGE_SOURCE_ACTION_IDS.MARK, ({ input }) =>
      this.ingest.markSource(input.state as KnowledgeSourceIngestState),
    );
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.EXTRACT,
      ({ input }) =>
        this.ingest.extractSource(input.state as KnowledgeSourceIngestState),
    );
    this.runner.registerAction(KNOWLEDGE_SOURCE_ACTION_IDS.CHUNK, ({ input }) =>
      this.ingest.chunkSource(input.state as KnowledgeSourceIngestState),
    );
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.REPLACE,
      ({ input }) =>
        this.ingest.replaceChunks(input.state as KnowledgeSourceIngestState),
    );
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE,
      ({ input }) => {
        const failure = input.failure as
          | { error?: string; nodeOutputs?: Record<string, unknown> }
          | undefined;
        const state =
          (input.state as KnowledgeSourceIngestState | undefined) ??
          this.lastIngestState(failure?.nodeOutputs);
        return this.ingest.finalizeSource(state, failure?.error);
      },
    );
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.DISCOVER_BACKFILL,
      async ({ input }) => {
        const scan = await this.ingest.scanForBackfill(
          input.request as KnowledgeSourceBackfillWorkflowInput,
        );
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

  enqueueIngest(request: KnowledgeSourceIngestWorkflowInput): Promise<string> {
    const definition = buildKnowledgeSourceIngestWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'knowledge-source',
      },
      `knowledge-source-ingest-${request.contextBaseId}-${request.sourceId}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  enqueueBackfill(
    request: KnowledgeSourceBackfillWorkflowInput,
  ): Promise<string> {
    const definition = buildKnowledgeSourceBackfillWorkflowDefinition();
    return this.queue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'knowledge-source-backfill',
      },
      `knowledge-source-backfill-${request.organizationId}`,
      { attempts: 1, replaceTerminalJob: true },
    );
  }
}
