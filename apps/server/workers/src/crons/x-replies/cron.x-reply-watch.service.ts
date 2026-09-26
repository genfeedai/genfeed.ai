import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import type { XReplyTargetPost } from '@api/collections/social-inbox/services/social-inbox.types';
import { CacheService } from '@api/services/cache/cache.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import type { TwitterInboxTweet } from '@api/services/integrations/twitter/services/twitter-inbox.service';
import {
  getTwitterRetryAfterMs,
  isTwitterRateLimitError,
  isTwitterScopeOrTierError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import { SocialReplyNotificationService } from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { Platform, PostStatus } from '@genfeedai/contracts';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import {
  X_REPLY_WATCH_CONCURRENCY,
  X_REPLY_WATCH_CURSOR_TTL_SECONDS,
  X_REPLY_WATCH_LOCK_KEY,
  X_REPLY_WATCH_LOCK_TTL_SECONDS,
  X_REPLY_WATCH_MAX_PAGES,
  X_REPLY_WATCH_MAX_RESULTS,
  X_REPLY_WATCH_RATE_LIMIT_FALLBACK_MS,
  X_REPLY_WATCH_RATE_LIMIT_MAX_MS,
  X_REPLY_WATCH_TIER_BACKOFF_MS,
  X_REPLY_WATCH_WINDOW_MS,
  xReplyWatchBackoffKey,
  xReplyWatchCursorKey,
  xReplyWatchPendingNotifyKey,
} from '@workers/crons/x-replies/x-reply-watch.constants';

export type XReplyWatchCredential = {
  brandId: string;
  externalHandle: string | null;
  id: string;
  organizationId: string;
  userId: string | null;
  username: string | null;
};

export type XReplyWatchTarget = {
  credential: XReplyWatchCredential;
  posts: XReplyTargetPost[];
};

export type XReplyWatchTotals = {
  credentials: number;
  failed: number;
  mentionsRead: number;
  notified: number;
  repliesCreated: number;
  repliesMatched: number;
  skipped: number;
};

type CredentialOutcome = Omit<XReplyWatchTotals, 'credentials'>;

const EMPTY_OUTCOME: CredentialOutcome = {
  failed: 0,
  mentionsRead: 0,
  notified: 0,
  repliesCreated: 0,
  repliesMatched: 0,
  skipped: 0,
};

const SNOWFLAKE_PATTERN = /^\d{1,20}$/;

/** X ids are snowflakes: numeric order is time order. */
function newestSnowflake(ids: ReadonlyArray<string | null | undefined>) {
  let newest: string | undefined;
  for (const id of ids) {
    if (!id || !SNOWFLAKE_PATTERN.test(id)) continue;
    if (!newest || BigInt(id) > BigInt(newest)) newest = id;
  }
  return newest;
}

function oldestSnowflake(ids: ReadonlyArray<string | null | undefined>) {
  let oldest: string | undefined;
  for (const id of ids) {
    if (!id || !SNOWFLAKE_PATTERN.test(id)) continue;
    if (!oldest || BigInt(id) < BigInt(oldest)) oldest = id;
  }
  return oldest;
}

/**
 * Picks up replies to X posts during their first day and notifies the owner.
 *
 * Cost model: accounts with no post published inside the window make no
 * call. Every other account makes exactly one `GET /2/users/:id/mentions`
 * per tick — replies to the account's posts land in its mentions timeline —
 * with `since_id` set to the newer of the stored cursor and the oldest
 * in-window post id (a reply is always newer than the post it answers).
 * There is no per-post `tweets/search/recent` fan-out here.
 */
@Injectable()
export class CronXReplyWatchService {
  private readonly context = CronXReplyWatchService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly twitterService: TwitterService,
    private readonly socialInboxService: SocialInboxService,
    private readonly socialReplyNotifications: SocialReplyNotificationService,
    private readonly logger: LoggerService,
  ) {}

  async watchRecentPostReplies(now = new Date()): Promise<XReplyWatchTotals> {
    const totals: XReplyWatchTotals = { credentials: 0, ...EMPTY_OUTCOME };
    const acquired = await this.cacheService.acquireLock(
      X_REPLY_WATCH_LOCK_KEY,
      X_REPLY_WATCH_LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      this.logger.debug('X reply watch already running, skipping tick', {
        context: this.context,
      });
      return totals;
    }

    try {
      const targets = await this.discoverTargets(now);
      totals.credentials = targets.length;
      for (
        let index = 0;
        index < targets.length;
        index += X_REPLY_WATCH_CONCURRENCY
      ) {
        const batch = targets.slice(index, index + X_REPLY_WATCH_CONCURRENCY);
        const outcomes = await Promise.all(
          batch.map((target) =>
            this.watchCredential(target).catch((error: unknown) => {
              // One broken account never stalls the rest of the sweep.
              this.logger.error('X reply watch failed for account', error, {
                context: this.context,
                credentialId: target.credential.id,
                organizationId: target.credential.organizationId,
              });
              return { ...EMPTY_OUTCOME, failed: 1 };
            }),
          ),
        );
        for (const outcome of outcomes) {
          for (const key of Object.keys(EMPTY_OUTCOME) as Array<
            keyof CredentialOutcome
          >) {
            totals[key] += outcome[key];
          }
        }
      }
      this.logger.log('X reply watch completed', {
        ...totals,
        context: this.context,
      });
      return totals;
    } finally {
      await this.cacheService.releaseLock(X_REPLY_WATCH_LOCK_KEY);
    }
  }

  /**
   * Connected X accounts with at least one post published in the window,
   * each with those posts. Posts must belong to the credential's own
   * organization and brand.
   */
  async discoverTargets(now: Date): Promise<XReplyWatchTarget[]> {
    const windowStart = new Date(now.getTime() - X_REPLY_WATCH_WINDOW_MS);
    // tenant-scope-ignore: platform sweep discovers connected X accounts across tenants; each target is paired with posts from its own organization below
    const credentials = await this.prisma.credential.findMany({
      select: {
        brandId: true,
        externalHandle: true,
        id: true,
        organizationId: true,
        userId: true,
        username: true,
      },
      where: {
        brandId: { not: null },
        isConnected: true,
        isDeleted: false,
        organizationId: { not: null },
        platform: PrismaCredentialPlatform.TWITTER,
      },
    });
    const credentialsById = new Map<string, XReplyWatchCredential>();
    for (const credential of credentials) {
      if (credential.organizationId && credential.brandId) {
        credentialsById.set(credential.id, {
          ...credential,
          brandId: credential.brandId,
          organizationId: credential.organizationId,
        });
      }
    }
    if (credentialsById.size === 0) {
      return [];
    }

    // tenant-scope-ignore: one indexed read for every discovered account; rows are re-checked against their credential's organization and brand
    const posts = await this.prisma.post.findMany({
      select: {
        brandId: true,
        credentialId: true,
        description: true,
        externalId: true,
        id: true,
        label: true,
        organizationId: true,
        url: true,
      },
      where: {
        credentialId: { in: [...credentialsById.keys()] },
        externalId: { not: null },
        isDeleted: false,
        organizationId: {
          in: [
            ...new Set(
              [...credentialsById.values()].map(
                (credential) => credential.organizationId,
              ),
            ),
          ],
        },
        platform: Platform.TWITTER,
        publishedAt: { gte: windowStart, lte: now },
        status: PostStatus.PUBLIC,
      },
    });

    const targets = new Map<string, XReplyWatchTarget>();
    for (const post of posts) {
      const credential = post.credentialId
        ? credentialsById.get(post.credentialId)
        : undefined;
      if (
        !credential ||
        credential.organizationId !== post.organizationId ||
        credential.brandId !== post.brandId
      ) {
        continue;
      }
      const target = targets.get(credential.id) ?? { credential, posts: [] };
      target.posts.push({
        brandId: post.brandId,
        description: post.description,
        externalId: post.externalId,
        id: post.id,
        label: post.label,
        url: post.url,
      });
      targets.set(credential.id, target);
    }
    return [...targets.values()];
  }

  private async watchCredential(
    target: XReplyWatchTarget,
  ): Promise<CredentialOutcome> {
    const { credential, posts } = target;
    if (await this.cacheService.get(xReplyWatchBackoffKey(credential.id))) {
      return { ...EMPTY_OUTCOME, skipped: 1 };
    }

    const storedCursor = await this.cacheService.get<string>(
      xReplyWatchCursorKey(credential.id),
    );
    const sinceId = newestSnowflake([
      storedCursor,
      oldestSnowflake(posts.map((post) => post.externalId)),
    ]);

    const mentions: TwitterInboxTweet[] = [];
    let paginationToken: string | undefined;
    try {
      for (let page = 0; page < X_REPLY_WATCH_MAX_PAGES; page++) {
        const result = await this.twitterService.listMentionsPage(
          credential.organizationId,
          credential.brandId,
          {
            limit: X_REPLY_WATCH_MAX_RESULTS,
            ...(paginationToken ? { paginationToken } : {}),
            ...(sinceId ? { sinceId } : {}),
          },
          credential.id,
        );
        mentions.push(...result.tweets);
        paginationToken = result.nextToken;
        if (!paginationToken) {
          break;
        }
      }
    } catch (error: unknown) {
      await this.handleProviderError(credential, error);
      return { ...EMPTY_OUTCOME, failed: 1 };
    }
    // X pages newest first. Stopping at the page cap leaves older mentions
    // unread between the cursor and the last page, so the cursor must not move.
    const hasUnreadPages = Boolean(paginationToken);
    if (hasUnreadPages) {
      this.logger.warn(
        'X reply watch hit the mention page cap; keeping cursor',
        {
          credentialId: credential.id,
          pages: X_REPLY_WATCH_MAX_PAGES,
        },
      );
    }

    const replies = matchRepliesToPosts(mentions, posts);
    const outcome: CredentialOutcome = {
      ...EMPTY_OUTCOME,
      mentionsRead: mentions.length,
      repliesMatched: replies.length,
    };

    let createdMessageIds: string[] = [];
    if (replies.length > 0) {
      const ingested = await this.socialInboxService.ingestXPostReplies(
        {
          brandId: credential.brandId,
          organizationId: credential.organizationId,
          userId: credential.userId ?? undefined,
        },
        { credentialId: credential.id, replies },
      );
      outcome.repliesCreated = ingested.messagesCreated;
      createdMessageIds = ingested.createdMessageIds;
    }
    outcome.notified = await this.notify(credential, createdMessageIds);

    const nextCursor = newestSnowflake([
      sinceId,
      ...mentions.map((mention) => mention.tweetId),
    ]);
    if (!hasUnreadPages && nextCursor && nextCursor !== storedCursor) {
      await this.cacheService.set(
        xReplyWatchCursorKey(credential.id),
        nextCursor,
        {
          ttl: X_REPLY_WATCH_CURSOR_TTL_SECONDS,
        },
      );
    }
    return outcome;
  }

  private async notify(
    credential: XReplyWatchCredential,
    createdMessageIds: string[],
  ): Promise<number> {
    const pendingKey = xReplyWatchPendingNotifyKey(credential.id);
    const pending = (await this.cacheService.get<string[]>(pendingKey)) ?? [];
    const replyIds = [...new Set([...pending, ...createdMessageIds])];
    if (replyIds.length === 0) {
      return 0;
    }
    try {
      const deliveryId = await this.socialReplyNotifications.recordNewReplies({
        accountHandle: credential.externalHandle ?? credential.username,
        brandId: credential.brandId,
        credentialId: credential.id,
        newReplyExternalIds: replyIds,
        organizationId: credential.organizationId,
        platform: Platform.TWITTER,
      });
      if (pending.length > 0) {
        await this.cacheService.del(pendingKey);
      }
      return deliveryId ? 1 : 0;
    } catch (error: unknown) {
      // The replies are stored and re-ingesting them creates nothing new, so
      // keep their ids and retry the notification next tick without X calls.
      await this.cacheService.set(pendingKey, replyIds, {
        ttl: X_REPLY_WATCH_WINDOW_MS / 1000,
      });
      this.logger.error('X reply notification failed', error, {
        context: this.context,
        credentialId: credential.id,
        organizationId: credential.organizationId,
      });
      return 0;
    }
  }

  private async handleProviderError(
    credential: XReplyWatchCredential,
    error: unknown,
  ): Promise<void> {
    const backoffMs = isTwitterRateLimitError(error)
      ? getTwitterRetryAfterMs(
          error,
          X_REPLY_WATCH_RATE_LIMIT_FALLBACK_MS,
          X_REPLY_WATCH_RATE_LIMIT_MAX_MS,
        )
      : isTwitterScopeOrTierError(error)
        ? X_REPLY_WATCH_TIER_BACKOFF_MS
        : undefined;

    if (backoffMs !== undefined) {
      await this.cacheService.set(
        xReplyWatchBackoffKey(credential.id),
        { until: new Date(Date.now() + backoffMs).toISOString() },
        { ttl: Math.max(60, Math.ceil(backoffMs / 1000)) },
      );
    } else {
      await this.twitterService.handleAuthorizationError(
        credential.id,
        error,
        this.context,
      );
    }

    this.logger.warn('X reply watch mentions read failed', {
      backoffMs,
      context: this.context,
      credentialId: credential.id,
      error: getErrorMessage(error),
      organizationId: credential.organizationId,
    });
  }
}

/**
 * Keep only replies that answer one of the account's in-window posts: a
 * direct reply, or a reply anywhere in a thread rooted at one of them.
 */
export function matchRepliesToPosts(
  mentions: readonly TwitterInboxTweet[],
  posts: readonly XReplyTargetPost[],
): Array<{ post: XReplyTargetPost; reply: TwitterInboxTweet }> {
  const postsByExternalId = new Map(
    posts.flatMap((post) =>
      post.externalId ? [[post.externalId, post] as const] : [],
    ),
  );
  return mentions.flatMap((reply) => {
    if (!reply.inReplyToId) {
      return [];
    }
    const post =
      postsByExternalId.get(reply.inReplyToId) ??
      postsByExternalId.get(reply.conversationId);
    return post ? [{ post, reply }] : [];
  });
}
