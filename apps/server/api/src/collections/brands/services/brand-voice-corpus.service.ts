import {
  buildVoiceCorpus,
  toPastedCandidates,
} from '@api/collections/brands/utils/brand-voice-corpus.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { SocialSourceType, TargetExecutionState } from '@genfeedai/contracts';
import type {
  BrandVoiceSampleKind,
  IBrandVoiceCorpus,
  IBrandVoiceCorpusCandidate,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Rows read per origin before selection. Covers a full history import (300
 * posts per account) across a few connected accounts while bounding the read.
 */
const OWN_ACCOUNT_FETCH_LIMIT = 600;
const PUBLISHED_POST_FETCH_LIMIT = 300;

const RETWEET_PREFIX_PATTERN = /^RT @/u;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeHandle(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/^@/, '').toLowerCase();
}

/**
 * Engagement from stored metrics: conversation and amplification count double
 * a like. Null when the row carries no numeric metric at all.
 */
function readEngagement(metrics: unknown): number | null {
  const record = asRecord(metrics);
  const weights: Record<string, number> = {
    comments: 2,
    likes: 1,
    quotes: 2,
    reposts: 2,
    shares: 2,
  };
  let total = 0;
  let hasMetric = false;
  for (const [key, weight] of Object.entries(weights)) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      hasMetric = true;
      total += value * weight;
    }
  }
  return hasMetric ? total : null;
}

interface OwnAccountRow {
  authorHandle: string | null;
  id: string;
  metrics: unknown;
  platform: string;
  publishedAt: Date | null;
  raw: unknown;
  source: { handle: string };
  text: string | null;
}

/**
 * Classifies an imported own-account post, or returns null when it is not the
 * brand's own writing: native reposts, quote posts, "RT @" copies, and rows
 * authored by another account are excluded. A reply to the account's own post
 * is a thread continuation and counts as an original.
 */
export function classifyOwnAccountPost(
  row: OwnAccountRow,
): BrandVoiceSampleKind | null {
  const text = row.text?.trim() ?? '';
  const raw = asRecord(row.raw);
  if (!text || RETWEET_PREFIX_PATTERN.test(text)) {
    return null;
  }
  if (raw.isRepost === true || raw.isRetweet === true || raw.isQuote === true) {
    return null;
  }
  if (
    readNonEmptyString(raw.quotedPostId) ||
    readNonEmptyString(raw.quotedId) ||
    readNonEmptyString(raw.quoteTweetId)
  ) {
    return null;
  }
  const author = normalizeHandle(row.authorHandle);
  const owner = normalizeHandle(row.source.handle);
  if (author && owner && author !== owner) {
    return null;
  }

  const inReplyTo = readNonEmptyString(raw.inReplyToId);
  const authorId = readNonEmptyString(raw.authorId);
  const isSelfReply = Boolean(inReplyTo && authorId && inReplyTo === authorId);
  if ((inReplyTo && !isSelfReply) || text.startsWith('@')) {
    return 'reply';
  }
  return 'original';
}

/**
 * Gathers the brand's OWN writing for voice drafting: posts imported from its
 * connected accounts (own-account sources only — followed and single-post
 * inspiration sources are never read) plus posts Genfeed published for it,
 * plus anything the user pasted as their own. Every read is scoped to the
 * organization and brand.
 */
@Injectable()
export class BrandVoiceCorpusService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Without a brand only the pasted samples form the corpus; stored posts are
   * never read across brands.
   */
  async buildCorpus(params: {
    brandId?: string;
    organizationId: string;
    pastedSamples?: readonly string[];
  }): Promise<IBrandVoiceCorpus> {
    const { brandId, organizationId } = params;
    const [ownAccount, published] = brandId
      ? await Promise.all([
          this.loadOwnAccountCandidates(organizationId, brandId),
          this.loadPublishedPostCandidates(organizationId, brandId),
        ])
      : [[], []];
    const corpus = buildVoiceCorpus([
      ...toPastedCandidates(params.pastedSamples),
      ...ownAccount,
      ...published,
    ]);

    this.logger.debug('Built brand voice corpus', {
      brandId: params.brandId,
      ownAccountCandidates: ownAccount.length,
      publishedCandidates: published.length,
      sampleCount: corpus.summary.sampleCount,
      service: this.constructorName,
    });

    return corpus;
  }

  private async loadOwnAccountCandidates(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandVoiceCorpusCandidate[]> {
    const rows = await this.prisma.sourcePost.findMany({
      orderBy: [
        { publishedAt: { nulls: 'last', sort: 'desc' } },
        { id: 'asc' },
      ],
      select: {
        authorHandle: true,
        id: true,
        metrics: true,
        platform: true,
        publishedAt: true,
        raw: true,
        source: { select: { handle: true } },
        text: true,
      },
      take: OWN_ACCOUNT_FETCH_LIMIT,
      where: scopedWhere(organizationId, {
        brandId,
        source: {
          is: scopedWhere(organizationId, {
            brandId,
            sourceType: SocialSourceType.OWN_ACCOUNT,
          }),
        },
        text: { not: null },
      }),
    });

    return rows.flatMap((row) => {
      const kind = classifyOwnAccountPost(row);
      if (!kind || !row.text) {
        return [];
      }
      return [
        {
          engagement: readEngagement(row.metrics),
          id: row.id,
          kind,
          origin: 'own-account' as const,
          platform: row.platform,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          text: row.text.trim(),
        },
      ];
    });
  }

  private async loadPublishedPostCandidates(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandVoiceCorpusCandidate[]> {
    const rows = await this.prisma.post.findMany({
      orderBy: [
        { publishedAt: { nulls: 'last', sort: 'desc' } },
        { id: 'asc' },
      ],
      select: {
        description: true,
        id: true,
        platform: true,
        publicationDate: true,
        publishedAt: true,
      },
      take: PUBLISHED_POST_FETCH_LIMIT,
      where: scopedWhere(organizationId, {
        brandId,
        // Quote posts wrap someone else's words; they are not voice evidence.
        quoteTweetId: null,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    });

    return rows.flatMap((row) => {
      const text = htmlToText(row.description);
      if (!text) {
        return [];
      }
      const publishedAt = row.publishedAt ?? row.publicationDate;
      return [
        {
          engagement: null,
          id: row.id,
          kind: 'original' as const,
          origin: 'published-post' as const,
          platform: row.platform,
          publishedAt: publishedAt?.toISOString() ?? null,
          text,
        },
      ];
    });
  }
}
