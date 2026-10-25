import {
  CLIPPER_ANALYSIS_FAILURE_WORKFLOW_ID,
  CLIPPER_ANALYSIS_WORKFLOW_ID,
} from '@api/collections/clipper-projects/services/clipper-analysis-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { ClipperAnalysisWorkflowInput } from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClipperAnalysisWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipperAnalysisWorkflowInput): Promise<string> {
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: CLIPPER_ANALYSIS_WORKFLOW_ID,
        canonicalId: CLIPPER_ANALYSIS_WORKFLOW_ID,
        inputValues: { job: data },
        metadata: { projectId: data.projectId },
        organizationId: data.orgId,
        source: 'clipper-analysis',
        userId: data.userId,
      },
      `clipper-analysis-${data.projectId}`,
      {
        attempts: 2,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        failureWorkflow: {
          canonicalId: CLIPPER_ANALYSIS_FAILURE_WORKFLOW_ID,
          inputValues: { job: data },
        },
      },
    );
  }
}
