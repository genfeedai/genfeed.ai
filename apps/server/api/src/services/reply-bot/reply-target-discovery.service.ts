import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  WARMUP_MAX_MONITORED_TARGETS,
  WARMUP_TARGET_MAX_FOLLOWERS,
  WARMUP_TARGET_MIN_FOLLOWERS,
} from '@genfeedai/contracts/constants';
import type {
  IReplyTarget,
  IReplyTargetAddResult,
  IReplyTargetSuggestion,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const SEARCH_RESULT_LIMIT = 50;
/** Authors looked up for follower counts; one user lookup each. */
const CANDIDATE_LOOKUP_LIMIT = 15;
const DEFAULT_SUGGESTION_COUNT = 10;

/**
 * Replies to a monitored account are drafted for a person to post, so the
 * monitor is tuned for a warming account: few, fresh, substantive.
 */
const WARMUP_REPLY_INSTRUCTIONS =
  'Add one specific, useful point to the post. No links, no hashtags, no self-promotion, no generic praise. Under 240 characters. Sound like a peer in the conversation.';
const WARMUP_RATE_LIMITS = {
  cooldownMinutes: 30,
  maxRepliesPerAccountPerDay: 1,
  maxRepliesPerDay: 12,
  maxRepliesPerHour: 3,
};

interface AuthorTally {
  displayName?: string;
  engagement: number;
  matchedPosts: number;
  samplePostId: string;
  samplePostText: string;
  username: string;
}

/**
 * Finds X accounts in the brand's niche worth replying to and adds them to the
 * warm-up monitor. It only reads: nothing is replied to from here, and the
 * monitor's replies are drafts for a person to post.
 */
@Injectable()
export class ReplyTargetDiscoveryService {
  constructor(
    private readonly twitterService: TwitterService,
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly monitoredAccountsService: MonitoredAccountsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async discover(params: {
    brandId: string;
    maxResults?: number;
    organizationId: string;
    query: string;
  }): Promise<IReplyTargetSuggestion[]> {
    const query = params.query.trim();
    if (query.length < 3) {
      throw new BadRequestException('Describe the niche in a few words.');
    }

    const posts = await this.twitterService.searchRecentTweets(
      `(${query}) -is:retweet -is:reply`,
      { maxResults: SEARCH_RESULT_LIMIT, sortOrder: 'relevancy' },
    );
    const [ownHandle, monitored] = await Promise.all([
      this.findOwnHandle(params.organizationId, params.brandId),
      this.findMonitoredUsernames(params.organizationId, params.brandId),
    ]);
    const excluded = new Set([...monitored, ownHandle].filter(Boolean));

    const tallies = new Map<string, AuthorTally>();
    for (const post of posts) {
      const username = post.authorUsername.toLowerCase();
      if (username === 'unknown' || excluded.has(username)) continue;
      const tally = tallies.get(username);
      if (tally) {
        tally.engagement += post.engagement;
        tally.matchedPosts += 1;
        continue;
      }
      tallies.set(username, {
        displayName: post.authorName,
        engagement: post.engagement,
        matchedPosts: 1,
        samplePostId: post.id,
        samplePostText: post.text,
        username: post.authorUsername,
      });
    }

    const candidates = [...tallies.values()]
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, CANDIDATE_LOOKUP_LIMIT);
    const lookups = await Promise.allSettled(
      candidates.map((candidate) =>
        this.twitterService.getUserByUsername(candidate.username),
      ),
    );

    const suggestions: IReplyTargetSuggestion[] = [];
    lookups.forEach((lookup, index) => {
      const candidate = candidates[index];
      if (!candidate || lookup.status !== 'fulfilled' || !lookup.value) return;
      const followersCount = lookup.value.followersCount ?? 0;
      if (
        followersCount < WARMUP_TARGET_MIN_FOLLOWERS ||
        followersCount > WARMUP_TARGET_MAX_FOLLOWERS
      ) {
        return;
      }
      suggestions.push({
        ...candidate,
        displayName: lookup.value.name ?? candidate.displayName,
        followersCount,
      });
    });

    return suggestions.slice(0, params.maxResults ?? DEFAULT_SUGGESTION_COUNT);
  }

  /**
   * Adds the account to the brand's warm-up monitor, creating the monitor on
   * first use. The monitor drafts replies; it never posts them.
   */
  async addTarget(params: {
    brandId: string;
    organizationId: string;
    userId: string;
    username: string;
  }): Promise<IReplyTargetAddResult> {
    const username = params.username.trim().replace(/^@/, '');
    if (!username) {
      throw new BadRequestException('Choose an account to monitor.');
    }

    const monitored = await this.findMonitoredUsernames(
      params.organizationId,
      params.brandId,
    );
    if (monitored.size >= WARMUP_MAX_MONITORED_TARGETS) {
      throw new BusinessLogicException(
        `Warm-up follows up to ${WARMUP_MAX_MONITORED_TARGETS} accounts at a time. Remove one first.`,
        { limit: WARMUP_MAX_MONITORED_TARGETS },
        'WARMUP_TARGET_LIMIT',
      );
    }

    const user = await this.twitterService.getUserByUsername(username);
    if (!user) {
      throw new BadRequestException(`@${username} was not found on X.`);
    }
    if (monitored.has(user.username.toLowerCase())) {
      throw new BusinessLogicException(
        `@${user.username} is already monitored.`,
        { username: user.username },
        'WARMUP_TARGET_EXISTS',
      );
    }

    const config = await this.ensureMonitor(params);
    const account = await this.monitoredAccountsService.create({
      botConfigId: config.id,
      brandId: params.brandId,
      credentialId: this.readCredentialId(config),
      displayName: user.name,
      externalId: user.id,
      followersCount: user.followersCount,
      isActive: true,
      organizationId: params.organizationId,
      platform: ReplyBotPlatform.TWITTER,
      userId: params.userId,
      username: user.username,
    });

    return {
      botConfigId: config.id,
      monitoredAccountId: account.id,
      username: user.username,
    };
  }

  /**
   * The accounts the brand's warm-up monitor follows, newest first. These are
   * the accounts counted against the monitored-account limit.
   */
  async listTargets(params: {
    brandId: string;
    organizationId: string;
  }): Promise<IReplyTarget[]> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: { config: true, id: true, isActive: true },
      where: scopedWhere(params.organizationId, { brandId: params.brandId }),
    });
    return accounts.flatMap((account) => {
      const config = (account.config ?? {}) as Record<string, unknown>;
      if (typeof config.username !== 'string') return [];
      return [
        {
          displayName:
            typeof config.displayName === 'string'
              ? config.displayName
              : undefined,
          followersCount:
            typeof config.followersCount === 'number'
              ? config.followersCount
              : undefined,
          isActive: account.isActive,
          monitoredAccountId: account.id,
          username: config.username,
        },
      ];
    });
  }

  /**
   * Stops monitoring an account for the brand, freeing a slot under the
   * limit. Drafts already in the queue stay there.
   */
  async removeTarget(params: {
    brandId: string;
    monitoredAccountId: string;
    organizationId: string;
  }): Promise<void> {
    const result = await this.prisma.monitoredAccount.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(params.organizationId, {
        brandId: params.brandId,
        id: params.monitoredAccountId,
      }),
    });
    if (result.count === 0) {
      throw new NotFoundException(
        'MonitoredAccount',
        params.monitoredAccountId,
      );
    }
  }

  private async ensureMonitor(params: {
    brandId: string;
    organizationId: string;
    userId: string;
  }): Promise<ReplyBotConfigDocument> {
    const existing = (
      await this.replyBotConfigsService.find({
        brandId: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
        type: ReplyBotType.ACCOUNT_MONITOR,
      })
    ).find(
      (config) =>
        String(config.platform ?? ReplyBotPlatform.TWITTER).toLowerCase() ===
        ReplyBotPlatform.TWITTER,
    );
    if (existing) return existing;

    const credentialId = await this.findBrandCredentialId(
      params.organizationId,
      params.brandId,
    );
    if (!credentialId) {
      throw new BadRequestException(
        'Connect one X account for this brand before starting warm-up.',
      );
    }

    return this.replyBotConfigsService.create({
      actionType: ReplyBotActionType.REPLY_ONLY,
      brandId: params.brandId,
      context:
        'You are warming up the brand’s X account by joining conversations in its niche.',
      credentialId,
      description:
        'Drafts replies to fresh posts from monitored X accounts. A person posts them from the warm-up queue.',
      filters: { maxAgeHours: 6, minTextLength: 40 },
      isActive: true,
      name: 'X warm-up replies',
      organizationId: params.organizationId,
      platform: ReplyBotPlatform.TWITTER,
      rateLimits: WARMUP_RATE_LIMITS,
      replyInstructions: WARMUP_REPLY_INSTRUCTIONS,
      replyLength: ReplyLength.SHORT,
      replyTone: ReplyTone.INFORMATIVE,
      type: ReplyBotType.ACCOUNT_MONITOR,
      userId: params.userId,
    });
  }

  private readCredentialId(config: ReplyBotConfigDocument): string | undefined {
    const fromConfig = (config.config as Record<string, unknown> | undefined)
      ?.credentialId;
    const credentialId = config.credentialId ?? fromConfig;
    return typeof credentialId === 'string' ? credentialId : undefined;
  }

  private async findMonitoredUsernames(
    organizationId: string,
    brandId: string,
  ): Promise<Set<string>> {
    const accounts = await this.prisma.monitoredAccount.findMany({
      select: { config: true },
      where: scopedWhere(organizationId, { brandId }),
    });
    const usernames = accounts.flatMap((account) => {
      const username = (account.config as Record<string, unknown> | null)
        ?.username;
      return typeof username === 'string' ? [username.toLowerCase()] : [];
    });
    return new Set(usernames);
  }

  private async findOwnHandle(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const platform = toPrismaCredentialPlatform(ReplyBotPlatform.TWITTER);
    if (!platform) return '';
    const credential = await this.prisma.credential.findFirst({
      select: { externalHandle: true },
      where: scopedWhere(organizationId, { brandId, platform }),
    });
    return (credential?.externalHandle ?? '').replace(/^@/, '').toLowerCase();
  }

  private async findBrandCredentialId(
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    const platform = toPrismaCredentialPlatform(ReplyBotPlatform.TWITTER);
    if (!platform) return undefined;
    const credentials = await this.prisma.credential.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: 2,
      where: scopedWhere(organizationId, { brandId, platform }),
    });
    if (credentials.length > 1) {
      this.logger.warn(
        `${ReplyTargetDiscoveryService.name} brand holds several X accounts; refusing to guess`,
        { brandId, organizationId },
      );
      return undefined;
    }
    return credentials[0]?.id;
  }
}
