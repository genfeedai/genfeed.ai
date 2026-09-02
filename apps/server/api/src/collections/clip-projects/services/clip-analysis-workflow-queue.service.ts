import {
  CLIP_ANALYSIS_FAILURE_WORKFLOW_ID,
  CLIP_ANALYSIS_WORKFLOW_ID,
} from '@api/collections/clip-projects/services/clip-analysis-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { ClipAnalysisWorkflowInput } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClipAnalysisWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipAnalysisWorkflowInput): Promise<string> {
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: CLIP_ANALYSIS_WORKFLOW_ID,
        canonicalId: CLIP_ANALYSIS_WORKFLOW_ID,
        inputValues: { job: data },
        metadata: { projectId: data.projectId },
        organizationId: data.orgId,
        source: 'clip-analysis',
        userId: data.userId,
      },
      `clip-analysis-${data.projectId}`,
      {
        attempts: 2,
        failureWorkflow: {
          canonicalId: CLIP_ANALYSIS_FAILURE_WORKFLOW_ID,
          inputValues: { job: data },
        },
        replaceTerminalJob: true,
      },
    );
  }
}
