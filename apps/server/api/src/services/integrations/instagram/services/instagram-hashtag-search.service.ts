import { CacheService } from '@api/services/cache/cache.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import {
  INSTAGRAM_HASHTAG_WEEKLY_LIMIT,
  INSTAGRAM_HASHTAG_WINDOW_MS,
  INSTAGRAM_HASHTAGS_PER_REFRESH,
} from '@genfeedai/contracts/constants';
import type {
  InstagramHashtagMedia,
  InstagramHashtagMediaItem,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const HASHTAG_MEDIA_FIELDS =
  'id,caption,children,comments_count,like_count,media_type,media_url,permalink,timestamp';
const HASHTAG_MEDIA_LIMIT = 25;
const HASHTAG_LEDGER_PREFIX = 'instagram:hashtag-budget';
const NON_HASHTAG_CHARACTERS = /[^\p{L}\p{N}_]/gu;
/** Graph error codes for an app that lacks the feature, and for call limits. */
const PERMISSION_ERROR_CODE = 10;
const RATE_LIMIT_ERROR_CODES: readonly number[] = [4, 17, 32, 613];

/** The app does not have Instagram Public Content Access. The trend refresh reads `statusCode` 403 as `access_required`. */
export class InstagramHashtagAccessError extends Error {
  readonly statusCode = 403;

  constructor() {
    super(
      'This app does not have Instagram Public Content Access, so hashtag search is unavailable.',
    );
    this.name = 'InstagramHashtagAccessError';
  }
}

/** The account's hashtag allowance for the week is spent. Read as `budget_exhausted` through `statusCode` 402. */
export class InstagramHashtagBudgetError extends Error {
  readonly statusCode = 402;

  constructor() {
    super(
      `The Instagram hashtag budget is spent: ${INSTAGRAM_HASHTAG_WEEKLY_LIMIT} unique hashtags per rolling 7 days.`,
    );
    this.name = 'InstagramHashtagBudgetError';
  }
}

/** Hashtags this account queried, with when it first did so inside the window. */
type HashtagLedger = Record<string, number>;

/** `#Café Latte` → `cafélatte`: Instagram searches one lowercase word. */
export function normalizeInstagramHashtag(raw: string): string {
  return raw.replace(NON_HASHTAG_CHARACTERS, '').toLowerCase();
}

interface GraphErrorBody {
  error?: { code?: number };
}

function graphErrorCode(error: unknown): number | undefined {
  const body = (error as { response?: { data?: GraphErrorBody } })?.response
    ?.data;
  return body?.error?.code;
}

/**
 * Reads the top media for a brand's tracked hashtags through Instagram's
 * official hashtag search (Instagram Public Content Access). The account may
 * query 30 unique hashtags in any rolling 7 days: a ledger per connected
 * account keeps the count, and a refresh spends at most five of them, hashtags
 * already queried this week first because they cost nothing more.
 */
@Traced()
@Injectable()
export class InstagramHashtagSearchService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Top media for the first affordable `candidates`, in the order given.
   * Throws `InstagramHashtagBudgetError` when candidates exist but none can be
   * queried, and `InstagramHashtagAccessError` when the app lacks the feature.
   */
  async readTopMedia(
    organizationId: string,
    brandId: string,
    candidates: readonly string[],
  ): Promise<InstagramHashtagMedia[]> {
    const hashtags = [
      ...new Set(candidates.map(normalizeInstagramHashtag).filter(Boolean)),
    ];
    if (hashtags.length === 0) return [];

    const credential = await this.instagramService.getValidCredential(
      organizationId,
      brandId,
    );
    if (!credential.externalId) return [];

    const ledgerKey = `${HASHTAG_LEDGER_PREFIX}:${credential.id}`;
    const now = Date.now();
    const ledger = this.pruneLedger(
      (await this.cacheService.get<HashtagLedger>(ledgerKey)) ?? {},
      now,
    );
    const chosen = this.chooseHashtags(hashtags, ledger);
    if (chosen.length === 0) throw new InstagramHashtagBudgetError();

    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const graph = this.instagramService.getGraphApiBaseUrl();
    const results: InstagramHashtagMedia[] = [];
    for (const hashtag of chosen) {
      // Counted before the call: a read that fails after Meta accepted it
      // still spends the query.
      ledger[hashtag] ??= now;
      await this.cacheService.set(ledgerKey, ledger, {
        ttl: Math.ceil(INSTAGRAM_HASHTAG_WINDOW_MS / 1000),
      });
      try {
        const items = await this.readHashtag(
          graph,
          credential.externalId,
          accessToken,
          hashtag,
        );
        results.push({ hashtag, items });
      } catch (error: unknown) {
        throw this.classify(error);
      }
    }

    this.loggerService.log('InstagramHashtagSearchService readTopMedia', {
      queried: chosen.length,
      uniqueThisWeek: Object.keys(ledger).length,
    });

    return results;
  }

  /** Hashtags queried this week cost nothing more; new ones spend the rest of the week's allowance. */
  private chooseHashtags(
    hashtags: readonly string[],
    ledger: HashtagLedger,
  ): string[] {
    const known = hashtags.filter((hashtag) => hashtag in ledger);
    let remaining = Math.max(
      INSTAGRAM_HASHTAG_WEEKLY_LIMIT - Object.keys(ledger).length,
      0,
    );
    const fresh = hashtags.filter((hashtag) => {
      if (hashtag in ledger || remaining <= 0) return false;
      remaining -= 1;
      return true;
    });

    return [...known, ...fresh].slice(0, INSTAGRAM_HASHTAGS_PER_REFRESH);
  }

  private pruneLedger(ledger: HashtagLedger, now: number): HashtagLedger {
    return Object.fromEntries(
      Object.entries(ledger).filter(
        ([, queriedAt]) => now - queriedAt < INSTAGRAM_HASHTAG_WINDOW_MS,
      ),
    );
  }

  private async readHashtag(
    graph: string,
    igUserId: string,
    accessToken: string,
    hashtag: string,
  ): Promise<InstagramHashtagMediaItem[]> {
    const search = await firstValueFrom(
      this.httpService.get<{ data?: Array<{ id?: string }> }>(
        `${graph}/ig_hashtag_search`,
        {
          params: { access_token: accessToken, q: hashtag, user_id: igUserId },
        },
      ),
    );
    const hashtagId = search.data.data?.[0]?.id;
    if (!hashtagId) return [];

    const media = await firstValueFrom(
      this.httpService.get<{
        data?: Array<{
          caption?: string;
          comments_count?: number;
          id?: string;
          like_count?: number;
          media_type?: string;
          media_url?: string;
          permalink?: string;
          timestamp?: string;
        }>;
      }>(`${graph}/${hashtagId}/top_media`, {
        params: {
          access_token: accessToken,
          fields: HASHTAG_MEDIA_FIELDS,
          limit: HASHTAG_MEDIA_LIMIT,
          user_id: igUserId,
        },
      }),
    );

    return (media.data.data ?? []).flatMap((item) =>
      item.id && item.permalink
        ? [
            {
              caption: item.caption,
              commentsCount: item.comments_count ?? 0,
              id: item.id,
              likeCount: item.like_count ?? 0,
              mediaType: item.media_type,
              mediaUrl: item.media_url,
              permalink: item.permalink,
              timestamp: item.timestamp,
            },
          ]
        : [],
    );
  }

  /** Turn a Graph refusal into the error the trend refresh classifies. */
  private classify(error: unknown): unknown {
    const code = graphErrorCode(error);
    if (code === PERMISSION_ERROR_CODE)
      return new InstagramHashtagAccessError();
    if (code !== undefined && RATE_LIMIT_ERROR_CODES.includes(code)) {
      return Object.assign(new Error('Instagram rate limit reached.'), {
        statusCode: 429,
      });
    }
    return error;
  }
}
