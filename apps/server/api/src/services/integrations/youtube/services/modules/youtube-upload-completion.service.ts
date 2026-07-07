import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import { PostStatus } from '@genfeedai/enums';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

type YoutubeUploadStatus =
  | 'unlisted'
  | 'public'
  | 'private'
  | 'scheduled'
  | 'failed';

const STATUS_MAP: Record<YoutubeUploadStatus, PostStatus> = {
  failed: PostStatus.FAILED,
  private: PostStatus.PRIVATE,
  public: PostStatus.PUBLIC,
  scheduled: PostStatus.SCHEDULED,
  unlisted: PostStatus.UNLISTED,
};

const PUBLISHED_STATUSES: YoutubeUploadStatus[] = [
  'unlisted',
  'public',
  'private',
];

type YoutubeUploadCompletionEvent = {
  postId: string;
  userId: string;
  organizationId: string;
  status: YoutubeUploadStatus;
  result?: { externalId: string; videoUrl: string } | null;
  error?: string;
  timestamp: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isYoutubeUploadStatus(value: unknown): value is YoutubeUploadStatus {
  return (
    typeof value === 'string' &&
    ['unlisted', 'public', 'private', 'scheduled', 'failed'].includes(value)
  );
}

function isYoutubeUploadCompletionEvent(
  value: unknown,
): value is YoutubeUploadCompletionEvent {
  if (
    !isPlainObject(value) ||
    typeof value.postId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.organizationId !== 'string' ||
    typeof value.timestamp !== 'string' ||
    !isYoutubeUploadStatus(value.status)
  ) {
    return false;
  }

  if (value.error !== undefined && typeof value.error !== 'string') {
    return false;
  }

  if (value.result !== undefined && value.result !== null) {
    if (
      !isPlainObject(value.result) ||
      typeof value.result.externalId !== 'string' ||
      typeof value.result.videoUrl !== 'string'
    ) {
      return false;
    }
  }

  return true;
}

@Injectable()
export class YoutubeUploadCompletionService implements OnModuleInit {
  private readonly logger = new Logger(YoutubeUploadCompletionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly postsService: PostsService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
  ) {}

  async onModuleInit() {
    await this.subscribeToYoutubeUploadCompletion();
  }

  private async subscribeToYoutubeUploadCompletion(): Promise<void> {
    await this.redisService.subscribe(
      'youtube:upload:complete',
      (data: unknown) => {
        if (!isYoutubeUploadCompletionEvent(data)) {
          this.logger.warn(
            'Received invalid YouTube upload completion payload',
          );
          return;
        }

        this.logger.log(
          `Received YouTube upload completion event for post ${data.postId}`,
        );

        void this.handleYoutubeUploadCompletion(data);
      },
    );
    this.logger.log('Subscribed to youtube:upload:complete channel');
  }

  private async handleYoutubeUploadCompletion(data: {
    postId: string;
    userId: string;
    organizationId: string;
    status: YoutubeUploadStatus;
    result?: { externalId: string; videoUrl: string } | null;
    error?: string;
    timestamp: string;
  }): Promise<void> {
    try {
      const { postId, status, result, error } = data;

      const updateData: Record<string, unknown> = {
        error: error || undefined,
        externalId: result?.externalId || undefined,
        status: STATUS_MAP[status] ?? PostStatus.FAILED,
      };

      if (PUBLISHED_STATUSES.includes(status)) {
        updateData.publicationDate = new Date();
      }

      const patchedPost = await this.postsService.patch(postId, updateData);
      const webhookPost = buildYoutubeWebhookPostSnapshot(data, patchedPost);

      if (PUBLISHED_STATUSES.includes(status)) {
        void this.publishEventWebhookService.emitLegacyPostPublished({
          externalProviderId: result?.externalId ?? null,
          occurredAt: parseCompletionTimestamp(data.timestamp),
          platform: 'youtube',
          post: webhookPost,
          publishedAt: updateData.publicationDate as Date | undefined,
          url: result?.videoUrl ?? null,
        });
      } else if (status === 'failed') {
        void this.publishEventWebhookService.emitLegacyPostFailed({
          errorMessage: error || 'YouTube upload failed',
          occurredAt: parseCompletionTimestamp(data.timestamp),
          platform: 'youtube',
          post: webhookPost,
          retryable: false,
        });
      }

      this.logger.log(
        `Updated post ${postId} status to ${status}${result?.externalId ? ` with externalId ${result.externalId}` : ''}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to handle YouTube upload completion for post ${data.postId}`,
        error,
      );
    }
  }
}

function buildYoutubeWebhookPostSnapshot(
  data: YoutubeUploadCompletionEvent,
  patchedPost: unknown,
): Record<string, unknown> {
  if (isPlainObject(patchedPost)) {
    return patchedPost;
  }

  return {
    externalId: data.result?.externalId,
    id: data.postId,
    organization: data.organizationId,
    organizationId: data.organizationId,
    platform: 'youtube',
    publicationDate: PUBLISHED_STATUSES.includes(data.status)
      ? parseCompletionTimestamp(data.timestamp)
      : undefined,
    status: STATUS_MAP[data.status] ?? PostStatus.FAILED,
    url: data.result?.videoUrl,
    user: data.userId,
  };
}

function parseCompletionTimestamp(timestamp: string): Date {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
