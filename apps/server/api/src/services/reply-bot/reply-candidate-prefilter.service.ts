import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import type { SocialContentData } from '@api/services/reply-bot/social-monitor.service';
import type { ReplyBotPlatform, ReplyBotType } from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

export interface ReplyCandidate extends SocialContentData {
  replyContext?: string;
}

export interface ReplyCandidatePrefilterOptions {
  botConfig: ReplyBotConfigDocument;
  botType: ReplyBotType;
  credential: IReplyBotCredentialData;
  organizationId: string;
  platform: ReplyBotPlatform;
}

export interface ReplyCandidatePrefilterResult {
  candidates: ReplyCandidate[];
  skipped: number;
  skipCounts: Record<string, number>;
}

type ReplyCandidateSkipReason =
  | 'duplicate'
  | 'excluded_author'
  | 'excluded_author_id'
  | 'excluded_url'
  | 'excluded_keyword'
  | 'missing_include_keyword'
  | 'too_old'
  | 'text_too_short'
  | 'followers_too_low'
  | 'followers_too_high'
  | 'engagement_too_low';

interface NormalizedReplyFilters {
  excludedAuthorIds: Set<string>;
  excludedAuthors: Set<string>;
  excludedKeywords: string[];
  excludedUrls: string[];
  includeKeywords: string[];
  maxAgeHours?: number;
  maxFollowers?: number;
  minComments?: number;
  minFollowers?: number;
  minLikes?: number;
  minShares?: number;
  minTextLength?: number;
  minViews?: number;
}

@Injectable()
export class ReplyCandidatePrefilterService {
  prefilter(
    candidates: SocialContentData[],
    options: ReplyCandidatePrefilterOptions,
  ): ReplyCandidatePrefilterResult {
    const filters = this.normalizeFilters(options);
    const seenTargets = new Set<string>();
    const accepted: ReplyCandidate[] = [];
    const skipCounts: Record<string, number> = {};

    for (const candidate of candidates) {
      const skipReason = this.getSkipReason(candidate, filters);
      if (skipReason) {
        this.incrementSkip(skipCounts, skipReason);
        continue;
      }

      const duplicateKey = this.getCandidateKey(candidate);
      if (seenTargets.has(duplicateKey)) {
        this.incrementSkip(skipCounts, 'duplicate');
        continue;
      }
      seenTargets.add(duplicateKey);

      accepted.push({
        ...candidate,
        replyContext: this.buildReplyContext(candidate),
      });
    }

    const skipped = Object.values(skipCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    return { candidates: accepted, skipped, skipCounts };
  }

  private normalizeFilters(
    options: ReplyCandidatePrefilterOptions,
  ): NormalizedReplyFilters {
    const filters = options.botConfig.filters ?? {};
    const keywords =
      typeof filters.keywords === 'object' && filters.keywords
        ? filters.keywords
        : {};
    const minEngagement =
      typeof filters.minEngagement === 'object' && filters.minEngagement
        ? filters.minEngagement
        : {};
    const ownUsername = this.normalize(options.credential.username);

    return {
      excludedAuthorIds: this.toNormalizedSet([
        ...this.asStringArray(filters.excludedAuthorIds),
        ...this.asStringArray(filters.excludeAuthorIds),
        ...this.asStringArray(filters.excludedAccountIds),
        ...this.asStringArray(filters.excludeAccountIds),
        this.normalize(options.credential.externalId),
      ]),
      excludedAuthors: this.toNormalizedSet([
        ...this.asStringArray(filters.excludedAuthors),
        ...this.asStringArray(filters.excludeAuthors),
        ...this.asStringArray(filters.excludedAuthorUsernames),
        ...this.asStringArray(filters.excludeAuthorUsernames),
        ...this.asStringArray(filters.excludedAccounts),
        ...this.asStringArray(filters.excludeAccounts),
        ownUsername,
      ]),
      excludedKeywords: [
        ...this.asStringArray(filters.excludeKeywords),
        ...this.asStringArray(keywords.exclude),
      ].map((value) => value.toLowerCase()),
      excludedUrls: [
        ...this.asStringArray(filters.excludedUrls),
        ...this.asStringArray(filters.excludeUrls),
        ...this.asStringArray(filters.excludedDomains),
        ...this.asStringArray(filters.excludeDomains),
      ].map((value) => value.toLowerCase()),
      includeKeywords: [
        ...this.asStringArray(filters.includeKeywords),
        ...this.asStringArray(keywords.include),
      ].map((value) => value.toLowerCase()),
      maxAgeHours: this.asPositiveNumber(filters.maxAgeHours),
      maxFollowers: this.asPositiveNumber(filters.maxFollowers),
      minComments: this.asPositiveNumber(minEngagement.minReplies),
      minFollowers: this.asPositiveNumber(filters.minFollowers),
      minLikes: this.asPositiveNumber(minEngagement.minLikes),
      minShares: this.asPositiveNumber(minEngagement.minRetweets),
      minTextLength: this.asPositiveNumber(filters.minTextLength),
      minViews: this.asPositiveNumber(minEngagement.minViews),
    };
  }

  private getSkipReason(
    candidate: SocialContentData,
    filters: NormalizedReplyFilters,
  ): ReplyCandidateSkipReason | undefined {
    const authorUsername = this.normalize(candidate.authorUsername);
    const authorId = this.normalize(candidate.authorId);
    const text = candidate.text.toLowerCase();
    const contentUrl = (candidate.contentUrl ?? '').toLowerCase();

    if (filters.excludedAuthors.has(authorUsername)) {
      return 'excluded_author';
    }

    if (filters.excludedAuthorIds.has(authorId)) {
      return 'excluded_author_id';
    }

    if (
      contentUrl &&
      filters.excludedUrls.some((excludedUrl) =>
        contentUrl.includes(excludedUrl),
      )
    ) {
      return 'excluded_url';
    }

    if (
      filters.includeKeywords.length > 0 &&
      !filters.includeKeywords.some((keyword) => text.includes(keyword))
    ) {
      return 'missing_include_keyword';
    }

    if (filters.excludedKeywords.some((keyword) => text.includes(keyword))) {
      return 'excluded_keyword';
    }

    if (
      filters.maxAgeHours &&
      Date.now() - candidate.createdAt.getTime() >
        filters.maxAgeHours * 60 * 60 * 1000
    ) {
      return 'too_old';
    }

    if (
      filters.minTextLength &&
      candidate.text.trim().length < filters.minTextLength
    ) {
      return 'text_too_short';
    }

    if (
      filters.minFollowers &&
      (candidate.authorFollowersCount ?? 0) < filters.minFollowers
    ) {
      return 'followers_too_low';
    }

    if (
      filters.maxFollowers &&
      (candidate.authorFollowersCount ?? 0) > filters.maxFollowers
    ) {
      return 'followers_too_high';
    }

    if (
      filters.minLikes &&
      (candidate.metrics?.likes ?? 0) < filters.minLikes
    ) {
      return 'engagement_too_low';
    }

    if (
      filters.minComments &&
      (candidate.metrics?.comments ?? 0) < filters.minComments
    ) {
      return 'engagement_too_low';
    }

    if (
      filters.minShares &&
      (candidate.metrics?.shares ?? 0) < filters.minShares
    ) {
      return 'engagement_too_low';
    }

    if (
      filters.minViews &&
      (candidate.metrics?.views ?? 0) < filters.minViews
    ) {
      return 'engagement_too_low';
    }

    return undefined;
  }

  private buildReplyContext(candidate: SocialContentData): string {
    const contextParts = [
      `Platform: ${candidate.platform}`,
      `Content type: ${candidate.contentType}`,
      candidate.contentUrl ? `URL: ${candidate.contentUrl}` : undefined,
      candidate.parentContentId
        ? `Parent content ID: ${candidate.parentContentId}`
        : undefined,
      candidate.inReplyToId
        ? `In reply to ID: ${candidate.inReplyToId}`
        : undefined,
      typeof candidate.authorFollowersCount === 'number'
        ? `Author followers: ${candidate.authorFollowersCount}`
        : undefined,
      candidate.metrics
        ? `Engagement: ${[
            `likes ${candidate.metrics.likes}`,
            typeof candidate.metrics.comments === 'number'
              ? `comments ${candidate.metrics.comments}`
              : undefined,
            typeof candidate.metrics.shares === 'number'
              ? `shares ${candidate.metrics.shares}`
              : undefined,
            typeof candidate.metrics.views === 'number'
              ? `views ${candidate.metrics.views}`
              : undefined,
          ]
            .filter(Boolean)
            .join(', ')}`
        : undefined,
      candidate.hashtags?.length
        ? `Hashtags: ${candidate.hashtags.join(', ')}`
        : undefined,
    ];

    return contextParts.filter(Boolean).join('\n');
  }

  private getCandidateKey(candidate: SocialContentData): string {
    const target =
      this.normalize(candidate.id) ||
      this.normalize(candidate.contentUrl) ||
      this.normalize(candidate.parentContentId) ||
      this.normalize(candidate.inReplyToId);

    return `${candidate.platform}:${target}`;
  }

  private incrementSkip(
    skipCounts: Record<string, number>,
    reason: ReplyCandidateSkipReason,
  ): void {
    skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
  }

  private toNormalizedSet(values: string[]): Set<string> {
    return new Set(
      values.map((value) => this.normalize(value)).filter(Boolean),
    );
  }

  private normalize(value: unknown): string {
    return typeof value === 'string'
      ? value.trim().replace(/^@/, '').toLowerCase()
      : '';
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private asPositiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && value > 0 ? value : undefined;
  }
}
