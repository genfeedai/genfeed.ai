import {
  CLIPPER_FACTORY_FAILURE_WORKFLOW_ID,
  CLIPPER_FACTORY_WORKFLOW_ID,
} from '@api/collections/clipper-projects/services/clipper-factory-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type ClipperFactoryWorkflowInput,
  DEFAULT_CLIP_RESULT_MODE,
  isClipperResultMode,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from '@genfeedai/contracts/interfaces';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ClipperFactoryWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipperFactoryWorkflowInput): Promise<string> {
    const job = this.validate(data);
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: CLIPPER_FACTORY_WORKFLOW_ID,
        canonicalId: CLIPPER_FACTORY_WORKFLOW_ID,
        inputValues: { job },
        metadata: { projectId: job.projectId },
        organizationId: job.orgId,
        source: 'clipper-factory',
        userId: job.userId,
      },
      `clipper-factory-${job.projectId}`,
      {
        attempts: 2,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        failureWorkflow: {
          canonicalId: CLIPPER_FACTORY_FAILURE_WORKFLOW_ID,
          inputValues: { job },
        },
      },
    );
  }

  private validate(
    data: ClipperFactoryWorkflowInput,
  ): ClipperFactoryWorkflowInput {
    const mode = data.mode ?? DEFAULT_CLIP_RESULT_MODE;
    if (!isClipperResultMode(mode)) {
      throw new BadRequestException(`Unknown clip generation mode "${mode}".`);
    }
    if (mode === 'avatar') {
      if (
        !data.avatarProvider ||
        !isSupportedAvatarVideoProviderName(data.avatarProvider)
      ) {
        throw new BadRequestException(
          `Avatar video provider "${data.avatarProvider ?? 'unknown'}" is not available. Supported providers: ${SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES.join(', ')}.`,
        );
      }
      if (
        data.avatarProvider !== 'genfeedai' &&
        (!data.avatarId || !data.voiceId)
      ) {
        throw new BadRequestException(
          'Avatar clip generation requires avatarId and voiceId.',
        );
      }
      if (
        data.avatarProvider === 'genfeedai' &&
        !data.referenceImageUrl &&
        !data.runReferences?.some(
          (reference) =>
            reference.role === 'character' && reference.url.length > 0,
        )
      ) {
        throw new BadRequestException(
          'GenfeedAI managed clip generation requires a brand character reference.',
        );
      }
    }
    return { ...data, mode };
  }
}
