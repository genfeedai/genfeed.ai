import { PostsService } from '@api/collections/posts/services/posts.service';
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

@Injectable()
export class YoutubeUploadCompletionService implements OnModuleInit {
  private readonly logger = new Logger(YoutubeUploadCompletionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly postsService: PostsService,
  ) {}

  async onModuleInit() {
    await this.subscribeToYoutubeUploadCompletion();
  }

  private async subscribeToYoutubeUploadCompletion(): Promise<unknown> {
    await this.redisService.subscribe(
      'youtube:upload:complete',
      (data: unknown) => {
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

      await this.postsService.patch(postId, updateData);

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
