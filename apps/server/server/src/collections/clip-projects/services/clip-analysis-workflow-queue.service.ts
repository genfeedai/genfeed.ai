import type { ClipAnalysisWorkflowInput } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import {
  buildClipAnalysisWorkflowDefinition,
  CLIP_ANALYSIS_ACTION_IDS,
  CLIP_ANALYSIS_WORKFLOW_ID,
} from '@server/collections/clip-projects/services/clip-analysis-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';

@Injectable()
export class ClipAnalysisWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipAnalysisWorkflowInput): Promise<string> {
    const definition = buildClipAnalysisWorkflowDefinition();
    return this.workflowQueue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: CLIP_ANALYSIS_WORKFLOW_ID,
        canonicalId: definition.canonicalId,
        inputValues: { job: data },
        metadata: { projectId: data.projectId },
        organizationId: data.orgId,
        source: 'clip-analysis',
        userId: data.userId,
      },
      `clip-analysis-${data.projectId}`,
      {
        actionId: CLIP_ANALYSIS_ACTION_IDS.FAIL,
        inputValues: { job: data },
      },
      { attempts: 2, replaceTerminalJob: true },
    );
  }
}
