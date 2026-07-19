import {
  CLIP_FACTORY_JOB_NAME,
  CLIP_FACTORY_QUEUE,
  ClipFactoryJobData,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from '@genfeedai/queue-contracts';
import {
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
} from '@genfeedai/interfaces';
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
      if (!data.avatarId || !data.voiceId) {
        throw new BadRequestException(
          'Avatar clip generation requires avatarId and voiceId.',
        );
      }

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
      youtubeUrl: data.youtubeUrl,
    });

    return job.id ?? data.projectId;
  }
}
