import type {
  KnowledgeSourceBackfillWorkflowInput,
  KnowledgeSourceIngestWorkflowInput,
} from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { KnowledgeSourceIngestService } from '@server/collections/contexts/services/knowledge-source-ingest.service';
import {
  buildKnowledgeSourceBackfillWorkflowDefinition,
  buildKnowledgeSourceIngestWorkflowDefinition,
  KNOWLEDGE_SOURCE_ACTION_IDS,
} from '@server/collections/contexts/services/knowledge-source-ingest-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';

@Injectable()
export class KnowledgeSourceIngestWorkflowService implements OnModuleInit {
  constructor(
    private readonly ingest: KnowledgeSourceIngestService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      KNOWLEDGE_SOURCE_ACTION_IDS.INGEST,
      ({ input }) =>
        this.ingest.ingest(input.request as KnowledgeSourceIngestWorkflowInput),
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

  enqueueIngest(request: KnowledgeSourceIngestWorkflowInput): Promise<string> {
    const definition = buildKnowledgeSourceIngestWorkflowDefinition();
    return this.queue.queueSystemWorkflowDefinition(
      definition,
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
    return this.queue.queueSystemWorkflowDefinition(
      definition,
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
