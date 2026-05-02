import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronTiktokStatusService {
  private readonly constructorName: string = String(this.constructor.name);

  // Max age for pending posts before marking as failed (24 hours)
  private readonly MAX_PENDING_AGE_HOURS = 24;

  // TikTok auth error codes that indicate credential needs re-authentication
  private readonly AUTH_ERROR_CODES = [
    'access_token_invalid',
    'invalid_grant',
    'invalid_refresh_token',
    'refresh_token_expired',
    'token_expired',
  ];

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly tiktokService: TiktokService,
    private readonly credentialsService: CredentialsService,
  ) {}

  /**
   * Check if an error is an authentication error
   */
  private isAuthError(error: unknown): boolean {
    const response = error?.response;
    const errorCode =
      response?.data?.error?.code ||
      response?.data?.error ||
      response?.data?.data?.error?.code;
    return this.AUTH_ERROR_CODES.includes(errorCode);
  }

  /**
   * Get the error code from a TikTok API error
   */
  private getErrorCode(error: unknown): string | undefined {
    const response = error?.response;
    return (
      response?.data?.error?.code ||
      response?.data?.error ||
      response?.data?.data?.error?.code
    );
  }

  /**
   * Check status of PENDING TikTok posts every 5 minutes
   * Polls TikTok API for post_id once moderation completes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkPendingTiktokPosts(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const now = new Date();
      const maxAge = new Date(
        now.getTime() - this.MAX_PENDING_AGE_HOURS * 60 * 60 * 1000,
      );

      const options = {
        customLabels,
        limit: 50,
      };

      // Find TikTok posts with PENDING status
      const posts: unknown = await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            externalId: { not: null }, // Has publish_id
            isDeleted: false,
            platform: CredentialPlatform.TIKTOK,
            status: PostStatus.PENDING,
          },
        },
        options,
      );

      const postsToCheck = posts.docs?.length || 0;

      if (postsToCheck === 0) {
        this.logger.log(`${url} completed - no pending posts`);
        return;
      }

      this.logger.log(`${url} checking ${postsToCheck} pending TikTok posts`);

      for (const post of posts.docs || []) {
        await this.checkPostStatus(post, now, maxAge);
      }

      this.logger.log(`${url} completed`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Check individual post status against TikTok API
   */
  private async checkPostStatus(
    post: PostEntity,
    now: Date,
    maxAge: Date,
  ): Promise<void> {
    const url = `${this.constructorName} checkPostStatus`;
    const publishId = post.externalId; // This is the publish_id stored temporarily

    try {
      // Check if post has been PENDING too long (use updatedAt since that's when it became PENDING)
      const pendingSince = new Date(post.updatedAt);
      if (pendingSince < maxAge) {
        this.logger.warn(`${url} post ${post._id} exceeded max pending age`, {
          hoursPending: Math.round(
            (now.getTime() - pendingSince.getTime()) / (60 * 60 * 1000),
          ),
          postId: post._id,
          publishId,
        });

        await this.markPostFailed(
          post,
          'TikTok moderation timeout - exceeded 24 hours',
        );
        return;
      }

      // Get credential for API call
      const credential = (
        post as unknown as {
          credential?: {
            _id?: string;
            accessToken?: string;
            externalHandle?: string;
            isConnected?: boolean;
          };
        }
      ).credential;
      if (!credential?.accessToken) {
        this.logger.warn(`${url} post ${post._id} has no valid credential`);
        await this.markPostFailed(
          post,
          'TikTok credential not found - please reconnect',
        );
        return;
      }

      // Check if credential is already disconnected
      if (credential.isConnected === false) {
        this.logger.warn(
          `${url} post ${post._id} has disconnected credential - marking as failed`,
        );
        await this.markPostFailed(
          post,
          'TikTok credential disconnected - please reconnect your TikTok account',
        );
        return;
      }

      // Refresh token before API call - pass credentialId to ensure we use the correct credential
      const refreshedCredential = await this.tiktokService.refreshToken(
        post.organization.toString(),
        post.brand.toString(),
        credential._id.toString(),
      );

      const decryptedAccessToken = EncryptionUtil.decrypt(
        refreshedCredential.accessToken,
      );

      // Call TikTok API to check publish status
      // Single attempt per cron run - cron runs every 5 minutes so no need to retry here
      const statusData = await this.tiktokService.getPublishStatus(
        decryptedAccessToken,
        publishId,
        1, // Single attempt per cron run
        0, // No delay needed
      );

      const hasPostId = !!statusData?.publicly_available_post_id?.[0];
      this.logger.log(`${url} post ${post._id} status check`, {
        hasPostId,
        publicly_available_post_id: statusData?.publicly_available_post_id,
        publishId,
        status: statusData?.status,
      });

      // Check if moderation complete and post_id available
      if (statusData?.status === 'PUBLISH_COMPLETE' && hasPostId) {
        const postId = statusData.publicly_available_post_id[0].toString();
        const postUrl = `https://www.tiktok.com/@${credential.externalHandle}/video/${postId}`;

        // Update post with real post_id and mark as PUBLIC
        await this.postsService.patch(post._id.toString(), {
          externalId: postId, // Replace publish_id with actual post_id
          publicationDate: new Date(),
          status: PostStatus.PUBLIC,
        });

        this.logger.log(`${url} post ${post._id} verified and published`, {
          postId,
          publishId,
          url: postUrl,
        });
        return;
      }

      // Note: If status === 'FAILED', getPublishStatus() throws an error which is caught
      // in the catch block below and handled by markPostFailed()

      // If PUBLISH_COMPLETE but no post_id, log and wait for next cron run
      if (statusData?.status === 'PUBLISH_COMPLETE' && !hasPostId) {
        const pendingSince = new Date(post.updatedAt);
        const hoursPending = Math.round(
          (now.getTime() - pendingSince.getTime()) / (60 * 60 * 1000),
        );
        this.logger.log(
          `${url} post ${post._id} is PUBLISH_COMPLETE but no post_id yet - will retry next cron run`,
          { hoursPending, publishId },
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${url} failed for post ${post._id}`, {
        error: (error as Error)?.message,
        publishId,
      });

      // Check if this is a TikTok moderation failure (thrown by getPublishStatus when status === 'FAILED')
      if (error.message?.startsWith('TikTok publish failed:')) {
        const failReason =
          error.message.replace('TikTok publish failed: ', '') ||
          'TikTok moderation rejected the post';
        await this.markPostFailed(post, failReason);
        return;
      }

      // Check if this is an auth error - mark credential as disconnected and fail the post
      if (this.isAuthError(error)) {
        const errorCode = this.getErrorCode(error);
        this.logger.warn(
          `${url} auth error for post ${post._id} - marking credential as disconnected`,
          { errorCode },
        );

        // Mark credential as disconnected (TiktokService.refreshToken should have done this already,
        // but we do it here as a safety net)
        if (
          (
            post as unknown as {
              credential?: {
                _id?: string;
                accessToken?: string;
                isConnected?: boolean;
              };
            }
          ).credential?._id
        ) {
          try {
            await this.credentialsService.patch(
              (
                post as unknown as {
                  credential?: {
                    _id?: string;
                    accessToken?: string;
                    isConnected?: boolean;
                  };
                }
              ).credential._id,
              {
                isConnected: false,
              },
            );
          } catch (patchError: unknown) {
            this.logger.error(
              `${url} failed to mark credential as disconnected`,
              patchError,
            );
          }
        }

        // Mark post as failed with clear message
        await this.markPostFailed(
          post,
          'TikTok authentication expired - please reconnect your TikTok account',
        );
        return;
      }

      // Don't mark as failed on transient errors - will retry next cron run
    }
  }

  /**
   * Mark a post as failed
   */
  private async markPostFailed(post: unknown, reason: string): Promise<void> {
    await this.postsService.patch(post._id.toString(), {
      status: PostStatus.FAILED,
    });

    this.logger.warn(`Post ${post._id} marked as failed`, { reason });
  }
}
