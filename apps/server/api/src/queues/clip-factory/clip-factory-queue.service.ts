import type { ClipSourceContract } from '@genfeedai/interfaces';
import {
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
} from '@genfeedai/interfaces';
import {
  CLIP_FACTORY_JOB_NAME,
  CLIP_FACTORY_QUEUE,
  ClipFactoryJobData,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class ClipFactoryQueueService {
  private readonly logContext = 'ClipFactoryQueueService';

  constructor(
    @InjectQueue(CLIP_FACTORY_QUEUE) private readonly clipFactoryQueue: Queue,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(data: ClipFactoryJobData): Promise<string> {
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
          `Avatar video provider "${data.avatarProvider ?? 'unknown'}" is not available. Supported providers: ${SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES.join(
            ', ',
          )}.`,
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

    const jobData: ClipFactoryJobData = { ...data, mode };
    const job = await this.clipFactoryQueue.add(
      CLIP_FACTORY_JOB_NAME,
      jobData,
      {
        jobId: `clip-factory-${data.projectId}`,
      },
    );

    this.logger.log(`${this.logContext} enqueued`, {
      jobId: job.id,
      projectId: data.projectId,
    });

    return job.id ?? data.projectId;
  }

  async retry(projectId: string, source: ClipSourceContract): Promise<string> {
    const jobId = `clip-factory-${projectId}`;
    const job = await this.clipFactoryQueue.getJob(jobId);
    if (!job || (await job.getState()) !== 'failed') {
      throw new BadRequestException(
        `Failed clip factory job ${jobId} was not found`,
      );
    }

    const sourceUrl = source.artifact?.mediaUrl;
    await job.updateData({
      ...job.data,
      ...(sourceUrl ? { youtubeUrl: sourceUrl } : {}),
      source,
    });
    await job.retry();
    return job.id ?? jobId;
  }
}
