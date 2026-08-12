/**
 * Author-reply conversation loop for brand posts.
 *
 * Implements the X Heavy Ranker lesson: author engages reader replies.
 * Uses COMMENT_RESPONDER path + harness-aware draft generation.
 */
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { mergeAuthorClosedLoopData } from '@api/services/reply-bot/author-closed-loop.util';
import type {
  AuthorReplyDraftResult,
  AuthorReplyInboxItem,
  AuthorReplyInboxResult,
  AuthorReplySendResult,
  EnsureAuthorResponderResult,
  RecordAuthorClosedLoopParams,
} from '@api/services/reply-bot/author-reply-loop.types';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  clampReplyMaxAgeHours,
  DEFAULT_REPLY_MAX_AGE_HOURS,
  getReplyIntentPersona,
  type ReplyIntent,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import { XActivitySubscriptionService } from '@api/services/reply-bot/x-activity-subscription.service';
import {
  toYouTubeChannelStartUrl,
  toYouTubeVideoUrl,
} from '@api/services/reply-bot/youtube-reply-url.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, Injectable } from '@nestjs/common';

const MAX_PARENT_POSTS = 12;
const MAX_COMMENTS_PER_POST = 40;

@Injectable()
export class AuthorReplyLoopService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly socialMonitorService: SocialMonitorService,
    private readonly replyGenerationService: ReplyGenerationService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly credentialsService: CredentialsService,
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly xActivitySubscriptionService: XActivitySubscriptionService,
  ) {}

  async ensureAuthorResponder(params: {
    brandId: string;
    credentialId?: string;
    isActive?: boolean;
    organizationId: string;
    /** Default twitter; youtube uses 48h age window. */
    platform?: 'twitter' | 'youtube';
    userId: string;
  }): Promise<EnsureAuthorResponderResult> {
    const platform =
      params.platform === 'youtube'
        ? ReplyBotPlatform.YOUTUBE
        : ReplyBotPlatform.TWITTER;
    const maxAgeHours =
      platform === ReplyBotPlatform.YOUTUBE ? 48 : DEFAULT_REPLY_MAX_AGE_HOURS;
    const existing = await this.findAuthorResponderConfig(
      params.organizationId,
      params.brandId,
      platform,
    );

    if (existing) {
      const credentialId =
        params.credentialId ?? this.readCredentialId(existing);
      const shouldActivate =
        params.isActive === true ||
        (params.isActive !== false && Boolean(credentialId));

      if (
        params.isActive !== undefined ||
        (params.credentialId && params.credentialId !== credentialId)
      ) {
        await this.replyBotConfigsService.patch(existing.id, {
          ...(params.credentialId ? { credentialId: params.credentialId } : {}),
          isActive:
            shouldActivate && Boolean(params.credentialId ?? credentialId),
        });
      }

      const refreshed = await this.findAuthorResponderConfig(
        params.organizationId,
        params.brandId,
        platform,
      );

      if (platform === ReplyBotPlatform.TWITTER) {
        void this.trySubscribeXActivity(params.organizationId, params.brandId);
      }

      return {
        botConfigId: refreshed?.id ?? existing.id,
        created: false,
        isActive: Boolean(refreshed?.isActive ?? existing.isActive),
        maxAgeHours,
        platform,
      };
    }

    const credentialId =
      params.credentialId ??
      (platform === ReplyBotPlatform.YOUTUBE
        ? await this.findYouTubeCredentialId(
            params.organizationId,
            params.brandId,
          )
        : await this.findTwitterCredentialId(
            params.organizationId,
            params.brandId,
          ));

    if (!credentialId && params.isActive !== false) {
      throw new BadRequestException(
        platform === ReplyBotPlatform.YOUTUBE
          ? 'Connect a YouTube credential for this brand before enabling replies'
          : 'Connect an X/Twitter credential for this brand before enabling replies',
      );
    }

    const created = await this.replyBotConfigsService.create({
      actionType: ReplyBotActionType.REPLY_ONLY,
      brandId: params.brandId,
      context:
        'You are the brand author replying on your own posts. Not reply-guy.',
      credentialId: credentialId ?? undefined,
      description:
        platform === ReplyBotPlatform.YOUTUBE
          ? 'Replies to comments on this brand’s YouTube videos (max 48h old).'
          : 'Replies to comments on this brand’s own X posts (max 24h old).',
      filters: {
        maxAgeHours,
      },
      isActive: Boolean(credentialId) && params.isActive !== false,
      name:
        platform === ReplyBotPlatform.YOUTUBE ? 'YouTube replies' : 'X replies',
      organizationId: params.organizationId,
      platform,
      replyInstructions:
        'Route by intent: warm thanks, answer questions, controlled wit for trolls, skip spam. Stay on-brand. Do not tag Grok.',
      replyLength: ReplyLength.MEDIUM,
      replyTone: ReplyTone.ENGAGING,
      type: ReplyBotType.COMMENT_RESPONDER,
      userId: params.userId,
    });

    if (platform === ReplyBotPlatform.TWITTER) {
      void this.trySubscribeXActivity(params.organizationId, params.brandId);
    }

    return {
      botConfigId: created.id,
      created: true,
      isActive: Boolean(created.isActive),
      maxAgeHours,
      platform,
    };
  }

  /**
   * Connect-later: attempt XAA/AAA subscription for the brand's X user.
   */
  private async trySubscribeXActivity(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    try {
      const credentialId = await this.findTwitterCredentialId(
        organizationId,
        brandId,
      );
      if (!credentialId) {
        return;
      }
      const credential = await this.credentialsService.findOne({
        id: credentialId,
        organizationId,
      });
      if (!credential?.externalId || !credential.accessToken) {
        return;
      }
      let userAccessToken: string | undefined;
      try {
        userAccessToken = EncryptionUtil.decrypt(credential.accessToken);
      } catch {
        userAccessToken = credential.accessToken;
      }
      await this.xActivitySubscriptionService.ensureSubscriptionForUser({
        externalUserId: credential.externalId,
        userAccessToken,
      });
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} X activity subscribe skipped`, {
        brandId,
        error: error instanceof Error ? error.message : 'unknown',
        organizationId,
      });
    }
  }

  async getInbox(params: {
    brandId: string;
    hours?: number;
    organizationId: string;
    /** Default twitter; youtube uses official/poll comment fetch when configured. */
    platform?: 'twitter' | 'youtube';
  }): Promise<AuthorReplyInboxResult> {
    const replyPlatform =
      params.platform === 'youtube'
        ? ReplyBotPlatform.YOUTUBE
        : ReplyBotPlatform.TWITTER;
    const hours =
      params.platform === 'youtube'
        ? clampReplyMaxAgeHours(params.hours ?? 48)
        : clampReplyMaxAgeHours(params.hours);

    const credential =
      replyPlatform === ReplyBotPlatform.YOUTUBE
        ? await this.loadYouTubeCredential(
            params.organizationId,
            params.brandId,
          )
        : await this.loadTwitterCredential(
            params.organizationId,
            params.brandId,
          );

    if (!credential) {
      throw new BadRequestException(
        replyPlatform === ReplyBotPlatform.YOUTUBE
          ? 'No active YouTube credential for this brand'
          : 'No active X credential with username for this brand',
      );
    }

    const timelineHandle =
      credential.username ||
      credential.externalId ||
      (replyPlatform === ReplyBotPlatform.YOUTUBE ? 'me' : '');

    if (!timelineHandle && replyPlatform === ReplyBotPlatform.TWITTER) {
      throw new BadRequestException(
        'No active X credential with username for this brand',
      );
    }

    // YouTube Apify handlers expect full channel/video URLs, not bare ids.
    const timelineTarget =
      replyPlatform === ReplyBotPlatform.YOUTUBE
        ? toYouTubeChannelStartUrl(timelineHandle)
        : timelineHandle || 'me';

    if (replyPlatform === ReplyBotPlatform.YOUTUBE && !timelineTarget) {
      throw new BadRequestException(
        'No active YouTube credential channel for this brand',
      );
    }

    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const ourUsername = (credential.username || credential.externalId || '')
      .replace(/^@/, '')
      .toLowerCase();

    let posts: SocialContentData[] = [];
    try {
      posts = await this.socialMonitorService.getUserTimeline(
        replyPlatform,
        timelineTarget,
        {
          brandId: params.brandId,
          limit: MAX_PARENT_POSTS,
          organizationId: params.organizationId,
          preferOfficialApi: true,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} timeline fetch failed`, {
        error: error instanceof Error ? error.message : 'unknown',
        platform: replyPlatform,
      });
      // Handled empty: return empty inbox rather than crashing the Replies UI.
      return {
        hours,
        items: [],
        platform: replyPlatform,
        username: credential.username || credential.externalId || undefined,
      };
    }

    const items: AuthorReplyInboxItem[] = [];
    const processedIds = await this.loadProcessedCommentIds(
      params.organizationId,
    );

    for (const post of posts) {
      // Parent posts older than the window are out of scope for fresh replies.
      if (post.createdAt && post.createdAt.getTime() < cutoff) {
        continue;
      }

      const commentTarget =
        replyPlatform === ReplyBotPlatform.YOUTUBE
          ? toYouTubeVideoUrl({
              contentUrl: post.contentUrl,
              id: post.id,
            })
          : post.id;

      let comments: SocialContentData[] = [];
      try {
        comments = await this.socialMonitorService.getContentComments(
          replyPlatform,
          commentTarget,
          {
            brandId: params.brandId,
            limit: MAX_COMMENTS_PER_POST,
            organizationId: params.organizationId,
            preferOfficialApi: true,
          },
        );
      } catch (error: unknown) {
        this.logger.warn(`${this.constructorName} comment fetch failed`, {
          error: error instanceof Error ? error.message : 'unknown',
          platform: replyPlatform,
          postId: post.id,
        });
        continue;
      }

      for (const comment of comments) {
        if (processedIds.has(comment.id)) {
          continue;
        }
        if (comment.createdAt && comment.createdAt.getTime() < cutoff) {
          continue;
        }
        const author = comment.authorUsername.replace(/^@/, '').toLowerCase();
        if (ourUsername && author === ourUsername) {
          continue;
        }

        const intent = resolveReplyIntent(comment.text);
        const persona = getReplyIntentPersona(intent);

        items.push({
          authorDisplayName: comment.authorDisplayName,
          authorId: comment.authorId,
          authorUsername: comment.authorUsername,
          commentId: comment.id,
          commentText: comment.text,
          commentUrl: comment.contentUrl,
          createdAt: comment.createdAt.toISOString(),
          intent,
          intentLabel: persona.label,
          parentPostId: post.id,
          parentPostPreview: post.text?.slice(0, 160),
          parentPostUrl: post.contentUrl,
          shouldSkipAuto: persona.shouldSkipAuto,
        });
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      hours,
      items: items.slice(0, 50),
      platform: replyPlatform,
      username: credential.username || credential.externalId || undefined,
    };
  }

  async draftReply(params: {
    brandId: string;
    commentId: string;
    commentText: string;
    commentAuthor: string;
    intent?: ReplyIntent;
    organizationId: string;
    parentPostPreview?: string;
    platform?: ReplyBotPlatform | 'twitter' | 'youtube';
    userId: string;
  }): Promise<AuthorReplyDraftResult> {
    const intent = resolveReplyIntent(params.commentText, params.intent);
    const persona = getReplyIntentPersona(intent);
    const platform = toAuthorReplyPlatform(params.platform);

    if (persona.shouldSkipAuto && !params.intent) {
      return {
        commentId: params.commentId,
        draft: '',
        harnessApplied: false,
        intent,
        intentLabel: persona.label,
      };
    }

    const draft = await this.replyGenerationService.generateReply({
      brandId: params.brandId,
      context: params.parentPostPreview
        ? `Parent post: ${params.parentPostPreview}`
        : undefined,
      customInstructions: [
        platform === ReplyBotPlatform.YOUTUBE
          ? 'You are the channel owner replying to a YouTube comment on your video.'
          : 'You are the author of the parent post replying on your own thread.',
        persona.instructions,
        `Tone: ${persona.toneHint}.`,
      ].join(' '),
      length:
        intent === 'thanks' || intent === 'troll'
          ? ReplyLength.SHORT
          : ReplyLength.MEDIUM,
      organizationId: params.organizationId,
      platform: platform,
      tone:
        intent === 'troll'
          ? ReplyTone.HUMOROUS
          : intent === 'thanks'
            ? ReplyTone.FRIENDLY
            : intent === 'question'
              ? ReplyTone.INFORMATIVE
              : ReplyTone.ENGAGING,
      tweetAuthor: params.commentAuthor,
      tweetContent: params.commentText,
      userId: params.userId,
    });

    return {
      commentId: params.commentId,
      draft,
      harnessApplied: true,
      intent,
      intentLabel: persona.label,
    };
  }

  async sendReply(params: {
    brandId: string;
    commentId: string;
    commentText: string;
    commentAuthor: string;
    commentAuthorId?: string;
    intent?: ReplyIntent;
    organizationId: string;
    parentPostId: string;
    parentPostPreview?: string;
    platform?: ReplyBotPlatform | 'twitter' | 'youtube';
    replyText?: string;
    userId: string;
  }): Promise<AuthorReplySendResult> {
    const replyPlatform = toAuthorReplyPlatform(params.platform);
    const platformLabel =
      replyPlatform === ReplyBotPlatform.YOUTUBE ? 'YouTube' : 'X';

    const credential =
      replyPlatform === ReplyBotPlatform.YOUTUBE
        ? await this.loadYouTubeCredential(
            params.organizationId,
            params.brandId,
          )
        : await this.loadTwitterCredential(
            params.organizationId,
            params.brandId,
          );
    if (!credential) {
      throw new BadRequestException(
        `No ${platformLabel} credential for this brand`,
      );
    }

    // YouTube reply API needs org/brand for token refresh; Instagram-style path.
    credential.organizationId = params.organizationId;
    credential.brandId = params.brandId;

    const intent = resolveReplyIntent(params.commentText, params.intent);
    if (intent === 'spam' && !params.replyText?.trim()) {
      throw new BadRequestException(
        'Spam comments are skipped by default — provide replyText to force-send',
      );
    }

    const drafted =
      params.replyText?.trim() ||
      (
        await this.draftReply({
          brandId: params.brandId,
          commentAuthor: params.commentAuthor,
          commentId: params.commentId,
          commentText: params.commentText,
          intent,
          organizationId: params.organizationId,
          parentPostPreview: params.parentPostPreview,
          platform: replyPlatform,
          userId: params.userId,
        })
      ).draft;

    const replyText = drafted.trim();
    if (!replyText) {
      throw new BadRequestException('Reply text is empty');
    }

    const result = await this.botActionExecutorService.postReply(
      credential,
      {
        authorId: params.commentAuthorId ?? '',
        authorUsername: params.commentAuthor,
        createdAt: new Date(),
        id: params.commentId,
        text: params.commentText,
      },
      replyText,
    );

    if (result.success) {
      await this.recordAuthorClosedLoop({
        brandId: params.brandId,
        commentId: params.commentId,
        organizationId: params.organizationId,
        parentPostId: params.parentPostId,
        platform: replyPlatform,
        replyContentId: result.contentId,
      });

      try {
        await this.processedTweetsService.markAsProcessed(
          params.commentId,
          params.organizationId,
          ReplyBotType.COMMENT_RESPONDER,
        );
      } catch {
        // Idempotent best-effort; do not fail the send path.
      }
    }

    return {
      commentId: params.commentId,
      contentId: result.contentId,
      contentUrl: result.contentUrl,
      error: result.error,
      intent,
      replyText,
      success: result.success,
    };
  }

  async recordAuthorClosedLoop(
    params: RecordAuthorClosedLoopParams,
  ): Promise<void> {
    try {
      const target = await this.prisma.contentPerformance.findFirst({
        orderBy: { measuredAt: 'desc' },
        where: scopedWhere(params.organizationId, {
          externalPostId: params.parentPostId,
          ...(params.brandId ? { brandId: params.brandId } : {}),
        }),
      });

      if (!target) {
        // Create a lightweight performance row so closed loops are not lost.
        await this.prisma.contentPerformance.create({
          data: {
            brandId: params.brandId,
            data: mergeAuthorClosedLoopData(
              {},
              {
                commentId: params.commentId,
                replyContentId: params.replyContentId,
              },
            ),
            externalPostId: params.parentPostId,
            measuredAt: new Date(),
            organizationId: params.organizationId,
            platform: params.platform ?? 'twitter',
            source: 'author-reply-loop',
          },
        });
        return;
      }

      await this.prisma.contentPerformance.update({
        data: {
          data: mergeAuthorClosedLoopData(target.data, {
            commentId: params.commentId,
            replyContentId: params.replyContentId,
          }) as never,
        },
        where: { id: target.id },
      });
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} closed-loop record failed`, {
        error: error instanceof Error ? error.message : 'unknown',
        parentPostId: params.parentPostId,
      });
    }
  }

  /**
   * Owner user id for billing/auto-send (from comment_responder config).
   */
  async findResponderOwnerUserId(
    organizationId: string,
    brandId: string,
    platform: ReplyBotPlatform = ReplyBotPlatform.TWITTER,
  ): Promise<string | undefined> {
    const config = await this.findAuthorResponderConfig(
      organizationId,
      brandId,
      platform,
    );
    if (!config) {
      return undefined;
    }
    const userId =
      typeof config.userId === 'string'
        ? config.userId
        : typeof (config as { user?: string }).user === 'string'
          ? (config as { user: string }).user
          : undefined;
    return userId || undefined;
  }

  private async findAuthorResponderConfig(
    organizationId: string,
    brandId: string,
    platform: ReplyBotPlatform = ReplyBotPlatform.TWITTER,
  ): Promise<ReplyBotConfigDocument | null> {
    const configs = await this.replyBotConfigsService.find({
      brandId,
      isDeleted: false,
      organizationId,
      type: ReplyBotType.COMMENT_RESPONDER,
    });
    const platformKey = String(platform).toLowerCase();
    return (
      configs.find((config) => {
        const fromRoot = String(config.platform ?? '').toLowerCase();
        const fromConfig = String(
          (config.config as Record<string, unknown> | undefined)?.platform ??
            '',
        ).toLowerCase();
        return fromRoot === platformKey || fromConfig === platformKey;
      }) ?? null
    );
  }

  private readCredentialId(config: ReplyBotConfigDocument): string | undefined {
    // Same dual-path as queue fan-out (root + nested config bag).
    const fromDoc = config.credentialId;
    if (typeof fromDoc === 'string' && fromDoc.trim()) {
      return fromDoc.trim();
    }
    const payload =
      config.config && typeof config.config === 'object'
        ? (config.config as Record<string, unknown>)
        : {};
    return typeof payload.credentialId === 'string' &&
      payload.credentialId.trim()
      ? payload.credentialId.trim()
      : undefined;
  }

  private async findBrandCredentialId(
    organizationId: string,
    brandId: string,
    platform: ReplyBotPlatform,
  ): Promise<string | undefined> {
    const prismaPlatform = toPrismaCredentialPlatform(platform);
    if (!prismaPlatform) {
      return undefined;
    }
    const credential = await this.prisma.credential.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId,
        isDeleted: false,
        platform: prismaPlatform,
      }),
    });
    return credential?.id;
  }

  private async loadPlatformCredential(
    organizationId: string,
    brandId: string,
    platform: ReplyBotPlatform,
  ): Promise<IReplyBotCredentialData | null> {
    const config = await this.findAuthorResponderConfig(
      organizationId,
      brandId,
      platform,
    );
    const credentialId =
      (config ? this.readCredentialId(config) : undefined) ??
      (await this.findBrandCredentialId(organizationId, brandId, platform));

    if (!credentialId) {
      return null;
    }

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
    });
    if (!credential) {
      throw new NotFoundException('Credential', credentialId);
    }

    const shaped = toReplyBotCredentialData(
      credential as unknown as Record<string, unknown>,
      {
        brandId,
        organizationId,
        platform,
      },
    );
    if (!shaped) {
      return null;
    }
    return shaped;
  }

  private loadTwitterCredential(
    organizationId: string,
    brandId: string,
  ): Promise<IReplyBotCredentialData | null> {
    return this.loadPlatformCredential(
      organizationId,
      brandId,
      ReplyBotPlatform.TWITTER,
    );
  }

  private loadYouTubeCredential(
    organizationId: string,
    brandId: string,
  ): Promise<IReplyBotCredentialData | null> {
    return this.loadPlatformCredential(
      organizationId,
      brandId,
      ReplyBotPlatform.YOUTUBE,
    );
  }

  private async loadProcessedCommentIds(
    organizationId: string,
  ): Promise<Set<string>> {
    try {
      const rows = await this.prisma.processedTweet.findMany({
        select: { tweetId: true },
        take: 500,
        where: {
          organizationId,
          processedBy: ReplyBotType.COMMENT_RESPONDER,
        },
      });
      return new Set(rows.map((row) => row.tweetId).filter(Boolean));
    } catch {
      return new Set();
    }
  }
}

/** Author-reply surfaces only support X + YouTube today. */
function toAuthorReplyPlatform(
  platform?: ReplyBotPlatform | 'twitter' | 'youtube',
): ReplyBotPlatform {
  if (platform === ReplyBotPlatform.YOUTUBE || platform === 'youtube') {
    return ReplyBotPlatform.YOUTUBE;
  }
  return ReplyBotPlatform.TWITTER;
}
