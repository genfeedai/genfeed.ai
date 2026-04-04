import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

const YOUTUBE_PRIVACY_STATUS_MAP: Record<string, PostStatus> = {
  private: PostStatus.PRIVATE,
  public: PostStatus.PUBLIC,
  unlisted: PostStatus.UNLISTED,
};

@Injectable()
export class CronYoutubeStatusService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly youtubeService: YoutubeService,
  ) {}

  /**
   * Check status of non-public YouTube videos every 15 minutes
   * Syncs database status with actual YouTube video status
   * Stops checking once video becomes PUBLIC (final state)
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async checkScheduledYoutubeVideos() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find YouTube posts that haven't reached PUBLIC status yet
      // Check posts from the last 7 days to catch any status changes
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const options = {
        customLabels,
        limit: 100, // Check up to 100 posts per run
      };

      const posts: unknown = await this.postsService.findAll(
        [
          {
            $match: {
              // Only check recent posts (last 7 days) to avoid checking old videos
              createdAt: { $gte: sevenDaysAgo },
              externalId: { $exists: true, $ne: null },
              isDeleted: false,
              platform: CredentialPlatform.YOUTUBE,
              // Only check non-public statuses (PRIVATE, UNLISTED, SCHEDULED)
              // Once PUBLIC, no need to keep checking
              status: {
                $in: [
                  PostStatus.PRIVATE,
                  PostStatus.UNLISTED,
                  PostStatus.SCHEDULED, // Videos waiting to be uploaded
                ],
              },
            },
          },
          {
            $lookup: {
              as: 'credential',
              foreignField: '_id',
              from: 'credentials',
              localField: 'credential',
            },
          },
          {
            $unwind: {
              path: '$credential',
              preserveNullAndEmptyArrays: true,
            },
          },
        ],
        options,
      );

      const postsChecked = posts.docs?.length || 0;

      if (postsChecked === 0) {
        this.logger.log(`${url} completed - no posts to check`);
        return;
      }

      this.logger.log(`${url} checking ${postsChecked} YouTube posts`);

      for (const post of posts.docs || []) {
        await this.checkPostStatus(post);
      }

      this.logger.log(`${url} completed - checked ${postsChecked} posts`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Check individual post status against YouTube API
   */
  private async checkPostStatus(post: PostEntity) {
    const url = `${this.constructorName} checkPostStatus`;

    try {
      if (!post.credential) {
        this.logger.warn(`${url} post ${post._id} has no credential`);
        return;
      }

      // Call YouTube API to get actual video status
      const videoStatus = await this.youtubeService.getVideoStatus(
        post.organization.toString(),
        post.brand.toString(),
        post.externalId,
      );

      this.logger.log(`${url} post ${post._id} video ${post.externalId}`, {
        privacyStatus: videoStatus.privacyStatus,
        publishAt: videoStatus.publishAt,
      });

      // Sync database status with YouTube's actual status
      const targetStatus =
        YOUTUBE_PRIVACY_STATUS_MAP[videoStatus.privacyStatus] ?? null;

      // Update if status doesn't match
      if (targetStatus && post.status !== targetStatus) {
        const updateData: unknown = {
          status: targetStatus,
        };

        // Set publicationDate when video becomes public for the first time
        if (targetStatus === PostStatus.PUBLIC && !post.publicationDate) {
          updateData.publicationDate = new Date();
        }

        await this.postsService.patch(post._id.toString(), updateData);

        this.logger.log(
          `${url} YouTube video ${post.externalId} status synced`,
          {
            newStatus: targetStatus,
            postId: post._id,
            previousStatus: post.status,
            youtubePrivacyStatus: videoStatus.privacyStatus,
          },
        );
      }

      // Special check for scheduled videos that haven't published
      if (
        videoStatus.privacyStatus === 'private' &&
        post.scheduledDate &&
        videoStatus.publishAt
      ) {
        const scheduledDate = new Date(post.scheduledDate);
        const now = new Date();
        const timeSinceScheduled = now.getTime() - scheduledDate.getTime();

        // If more than 1 hour past scheduled time and still private, log warning
        if (timeSinceScheduled > 60 * 60 * 1000) {
          this.logger.warn(
            `${url} YouTube video ${post.externalId} still private 1+ hour after scheduled time`,
            {
              hoursSinceScheduled: Math.round(
                timeSinceScheduled / (60 * 60 * 1000),
              ),
              postId: post._id,
              publishAt: videoStatus.publishAt,
              scheduledDate: scheduledDate.toISOString(),
            },
          );
        }
      }
    } catch (error: unknown) {
      // If video not found on YouTube, mark post as deleted
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('Video not found') ||
        errorMessage.includes('status not available')
      ) {
        this.logger.warn(
          `${url} video ${post.externalId} not found on YouTube, marking post as deleted`,
          { postId: post._id },
        );

        await this.postsService.patch(post._id.toString(), {
          isDeleted: true,
        });

        return;
      }

      this.logger.error(
        `${url} failed to check status for post ${post._id}`,
        error,
      );
    }
  }
}
