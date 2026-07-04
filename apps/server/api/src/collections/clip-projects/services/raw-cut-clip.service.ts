import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Provider name recorded on deterministic clip-results. */
export const RAW_CUT_PROVIDER_NAME = 'raw-cut';

export interface RawCutDispatchInput {
  /** Clip-result id — used as the files-service ingredient id + callback key. */
  clipResultId: string;
  /** Source video location; an S3 key is preferred, a URL is the fallback. */
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  /** Highlight window, in seconds, relative to the source video. */
  startTime: number;
  endTime: number;
  /** Highlight-relative SRT to burn once the cut completes. */
  captionSrt: string;
  organizationId: string;
  userId: string;
  authProviderUserId?: string;
  room?: string;
  websocketUrl?: string;
}

export interface RawCutDispatchResult {
  jobId: string;
  providerName: typeof RAW_CUT_PROVIDER_NAME;
  status: string;
}

/**
 * Deterministic counterpart to {@link AvatarVideoService}: instead of firing an
 * external avatar provider, it dispatches the highlight cut onto the files
 * service `clip-trim` primitive (see #1235) and carries the caption SRT for the
 * downstream burn-in performed by the clip orchestrator (#1237).
 *
 * This service only *dispatches* the deterministic job and returns its handle;
 * chaining the caption burn and persisting the produced URL is the orchestrator's
 * responsibility.
 */
@Injectable()
export class RawCutClipService {
  private readonly logContext = 'RawCutClipService';

  constructor(
    private readonly fileQueueService: FileQueueService,
    private readonly logger: LoggerService,
  ) {}

  async dispatchClip(
    input: RawCutDispatchInput,
  ): Promise<RawCutDispatchResult> {
    const {
      clipResultId,
      sourceVideoS3Key,
      sourceVideoUrl,
      startTime,
      endTime,
      captionSrt,
      organizationId,
      userId,
      authProviderUserId,
      room,
      websocketUrl,
    } = input;

    if (!sourceVideoS3Key && !sourceVideoUrl) {
      throw new Error(
        'Raw-cut clip requires a source video reference (s3Key or url).',
      );
    }

    const duration = endTime - startTime;

    const response = await this.fileQueueService.processVideo({
      authProviderUserId,
      ingredientId: clipResultId,
      organizationId,
      params: {
        captionContent: captionSrt,
        duration,
        endTime,
        inputPath: sourceVideoUrl,
        s3Key: sourceVideoS3Key,
        startTime,
      },
      room,
      type: 'clip-trim',
      userId,
      websocketUrl: websocketUrl ?? `/clips/${clipResultId}`,
    });

    this.logger.log(`${this.logContext} clip-trim job dispatched`, {
      clipResultId,
      duration,
      jobId: response.jobId,
      organizationId,
    });

    return {
      jobId: response.jobId,
      providerName: RAW_CUT_PROVIDER_NAME,
      status: response.status,
    };
  }
}
