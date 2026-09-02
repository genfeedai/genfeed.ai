import {
  CLIP_FACTORY_FAILURE_WORKFLOW_ID,
  CLIP_FACTORY_WORKFLOW_ID,
} from '@api/collections/clip-projects/services/clip-factory-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type ClipFactoryWorkflowInput,
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ClipFactoryWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipFactoryWorkflowInput): Promise<string> {
    const job = this.validate(data);
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: CLIP_FACTORY_WORKFLOW_ID,
        canonicalId: CLIP_FACTORY_WORKFLOW_ID,
        inputValues: { job },
        metadata: { projectId: job.projectId },
        organizationId: job.orgId,
        source: 'clip-factory',
        userId: job.userId,
      },
      `clip-factory-${job.projectId}`,
      {
        attempts: 2,
        failureWorkflow: {
          canonicalId: CLIP_FACTORY_FAILURE_WORKFLOW_ID,
          inputValues: { job },
        },
        replaceTerminalJob: true,
      },
    );
  }

  private validate(data: ClipFactoryWorkflowInput): ClipFactoryWorkflowInput {
    const mode = data.mode ?? DEFAULT_CLIP_RESULT_MODE;
    if (!isClipResultMode(mode)) {
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
