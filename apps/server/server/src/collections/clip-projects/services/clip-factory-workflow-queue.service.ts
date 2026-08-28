import {
  type ClipFactoryWorkflowInput,
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildClipFactoryWorkflowDefinition,
  CLIP_FACTORY_ACTION_IDS,
  CLIP_FACTORY_WORKFLOW_ID,
} from '@server/collections/clip-projects/services/clip-factory-workflow-definition';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';

@Injectable()
export class ClipFactoryWorkflowQueueService {
  constructor(private readonly workflowQueue: WorkflowExecutionQueueService) {}

  async enqueue(data: ClipFactoryWorkflowInput): Promise<string> {
    const job = this.validate(data);
    const definition = buildClipFactoryWorkflowDefinition();
    return this.workflowQueue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: CLIP_FACTORY_WORKFLOW_ID,
        canonicalId: definition.canonicalId,
        inputValues: { job },
        metadata: { projectId: job.projectId },
        organizationId: job.orgId,
        source: 'clip-factory',
        userId: job.userId,
      },
      `clip-factory-${job.projectId}`,
      {
        actionId: CLIP_FACTORY_ACTION_IDS.FAIL,
        inputValues: { job },
      },
      { attempts: 2, replaceTerminalJob: true },
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
