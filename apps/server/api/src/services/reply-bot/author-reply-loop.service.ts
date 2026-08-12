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
  ) {}

  async ensureAuthorResponder(params: {
    brandId: string;
    credentialId?: string;
    isActive?: boolean;
    organizationId: string;
    userId: string;
  }): Promise<EnsureAuthorResponderResult> {
    const platform = ReplyBotPlatform.TWITTER;
    const existing = await this.findAuthorResponderConfig(
      params.organizationId,
      params.brandId,
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
      );

      return {
        botConfigId: refreshed?.id ?? existing.id,
        created: false,
        isActive: Boolean(refreshed?.isActive ?? existing.isActive),
        maxAgeHours: DEFAULT_REPLY_MAX_AGE_HOURS,
        platform,
      };
    }

    const credentialId =
      params.credentialId ??
      (await this.findTwitterCredentialId(
        params.organizationId,
        params.brandId,
      ));

    if (!credentialId && params.isActive !== false) {
      throw new BadRequestException(
        'Connect an X/Twitter credential for this brand before enabling author replies',
      );
    }

    const created = await this.replyBotConfigsService.create({
      actionType: ReplyBotActionType.REPLY_ONLY,
      brandId: params.brandId,
      context:
        'You are the brand author replying on your own posts. Not reply-guy.',
      credentialId: credentialId ?? undefined,
      description:
        'Replies to comments on this brand’s own X posts (max 24h old).',
      filters: {
        maxAgeHours: DEFAULT_REPLY_MAX_AGE_HOURS,
      },
      isActive: Boolean(credentialId) && params.isActive !== false,
      name: 'X replies',
      organizationId: params.organizationId,
      platform,
      replyInstructions:
        'Route by intent: warm thanks, answer questions, controlled wit for trolls, skip spam. Stay on-brand. Do not tag Grok.',
      replyLength: ReplyLength.MEDIUM,
      replyTone: ReplyTone.ENGAGING,
      type: ReplyBotType.COMMENT_RESPONDER,
      userId: params.userId,
    });

    return {
      botConfigId: created.id,
      created: true,
      isActive: Boolean(created.isActive),
      maxAgeHours: DEFAULT_REPLY_MAX_AGE_HOURS,
      platform,
    };
  }

  async getInbox(params: {
    brandId: string;
    hours?: number;
    organizationId: string;
  }): Promise<AuthorReplyInboxResult> {
    const hours = clampReplyMaxAgeHours(params.hours);
    const credential = await this.loadTwitterCredential(
      params.organizationId,
      params.brandId,
    );
    if (!credential?.username) {
      throw new BadRequestException(
        'No active X credential with username for this brand',
      );
    }

    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const ourUsername = credential.username.replace(/^@/, '').toLowerCase();

    const posts = await this.socialMonitorService.getUserTimeline(
      ReplyBotPlatform.TWITTER,
      credential.username,
      {
        brandId: params.brandId,
        limit: MAX_PARENT_POSTS,
        organizationId: params.organizationId,
        preferOfficialApi: true,
      },
    );

    const items: AuthorReplyInboxItem[] = [];
    const processedIds = await this.loadProcessedCommentIds(
      params.organizationId,
    );

    for (const post of posts) {
      // Parent posts older than the window are out of scope for fresh replies.
      if (post.createdAt && post.createdAt.getTime() < cutoff) {
        continue;
      }

      let comments: SocialContentData[] = [];
      try {
        comments = await this.socialMonitorService.getContentComments(
          ReplyBotPlatform.TWITTER,
          post.id,
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
        if (author === ourUsername) {
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
      platform: ReplyBotPlatform.TWITTER,
      username: credential.username,
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
    userId: string;
  }): Promise<AuthorReplyDraftResult> {
    const intent = resolveReplyIntent(params.commentText, params.intent);
    const persona = getReplyIntentPersona(intent);

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
        'You are the author of the parent post replying on your own thread.',
        persona.instructions,
        `Tone: ${persona.toneHint}.`,
      ].join(' '),
      length:
        intent === 'thanks' || intent === 'troll'
          ? ReplyLength.SHORT
          : ReplyLength.MEDIUM,
      organizationId: params.organizationId,
      platform: 'twitter',
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
    replyText?: string;
    userId: string;
  }): Promise<AuthorReplySendResult> {
    const credential = await this.loadTwitterCredential(
      params.organizationId,
      params.brandId,
    );
    if (!credential) {
      throw new BadRequestException('No X credential for this brand');
    }

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
        platform: 'twitter',
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

  private async findAuthorResponderConfig(
    organizationId: string,
    brandId: string,
  ): Promise<ReplyBotConfigDocument | null> {
    const configs = await this.replyBotConfigsService.find({
      brandId,
      isDeleted: false,
      organizationId,
      type: ReplyBotType.COMMENT_RESPONDER,
    });
    return (
      configs.find(
        (config) =>
          String(config.platform ?? '').toLowerCase() ===
            ReplyBotPlatform.TWITTER ||
          String(
            (config.config as Record<string, unknown> | undefined)?.platform ??
              '',
          ).toLowerCase() === ReplyBotPlatform.TWITTER,
      ) ??
      configs[0] ??
      null
    );
  }

  private readCredentialId(config: ReplyBotConfigDocument): string | undefined {
    const fromDoc = config.credentialId;
    if (typeof fromDoc === 'string' && fromDoc) {
      return fromDoc;
    }
    const payload =
      config.config && typeof config.config === 'object'
        ? (config.config as Record<string, unknown>)
        : {};
    return typeof payload.credentialId === 'string'
      ? payload.credentialId
      : undefined;
  }

  private async findTwitterCredentialId(
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    const prismaPlatform = toPrismaCredentialPlatform('twitter');
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

  private async loadTwitterCredential(
    organizationId: string,
    brandId: string,
  ): Promise<IReplyBotCredentialData | null> {
    const config = await this.findAuthorResponderConfig(
      organizationId,
      brandId,
    );
    const credentialId =
      (config ? this.readCredentialId(config) : undefined) ??
      (await this.findTwitterCredentialId(organizationId, brandId));

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

    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken ?? ''),
      accessTokenSecret: credential.accessTokenSecret
        ? EncryptionUtil.decrypt(credential.accessTokenSecret)
        : undefined,
      externalId: credential.externalId ?? undefined,
      platform: ReplyBotPlatform.TWITTER,
      refreshToken: credential.refreshToken
        ? EncryptionUtil.decrypt(credential.refreshToken)
        : undefined,
      username: credential.username ?? undefined,
    };
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
