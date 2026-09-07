import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const GRAPH_URL = 'https://graph.facebook.com';
const GRAPH_API_VERSION = 'v22.0';
const PAGE_SIZE = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 15_000;

const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count,shortcode';
const MEDIA_INSIGHTS_FIELDS = `${MEDIA_FIELDS},insights.metric(impressions,reach,saved,shares,total_interactions)`;

interface InstagramGraphMediaNode {
  caption?: unknown;
  comments_count?: unknown;
  id?: unknown;
  insights?: {
    data?: Array<{ name?: unknown; values?: Array<{ value?: unknown }> }>;
  };
  like_count?: unknown;
  media_product_type?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  permalink?: unknown;
  shortcode?: unknown;
  thumbnail_url?: unknown;
  timestamp?: unknown;
}

interface InstagramGraphMediaPage {
  data?: InstagramGraphMediaNode[];
  paging?: { cursors?: { after?: unknown }; next?: unknown };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function readInsight(
  node: InstagramGraphMediaNode,
  metric: string,
): number | undefined {
  const entry = node.insights?.data?.find((item) => item.name === metric);
  return readCount(entry?.values?.[0]?.value);
}

function toContentType(node: InstagramGraphMediaNode): string {
  const productType = readString(node.media_product_type)?.toUpperCase();
  if (productType === 'REELS') {
    return 'reel';
  }
  const mediaType = readString(node.media_type)?.toUpperCase();
  if (mediaType === 'VIDEO') {
    return 'video';
  }
  return 'post';
}

function mapMediaNode(
  node: InstagramGraphMediaNode,
  handle: string,
  igUserId: string,
): CollectedSourcePost | undefined {
  const id = readString(node.id);
  if (!id) {
    return undefined;
  }
  const timestamp = readString(node.timestamp);
  const mediaUrl = readString(node.media_url);
  const thumbnailUrl = readString(node.thumbnail_url) ?? mediaUrl;
  const shortcode = readString(node.shortcode);

  return {
    authorId: igUserId,
    authorUsername: handle,
    contentType: toContentType(node),
    contentUrl:
      readString(node.permalink) ??
      (shortcode ? `https://www.instagram.com/p/${shortcode}/` : undefined),
    createdAt: timestamp ? new Date(timestamp) : undefined,
    id,
    mediaUrls: mediaUrl ? [mediaUrl] : [],
    metrics: {
      comments: readCount(node.comments_count),
      impressions: readInsight(node, 'impressions'),
      likes: readCount(node.like_count),
      reach: readInsight(node, 'reach'),
      saves: readInsight(node, 'saved'),
      shares: readInsight(node, 'shares'),
      views: readInsight(node, 'impressions') ?? readInsight(node, 'reach'),
    },
    platform: SocialSourcePlatform.INSTAGRAM,
    text: readString(node.caption) ?? '',
    thumbnailUrl,
  };
}

/**
 * Official Instagram Graph provider for the brand's own professional account.
 *
 * The Graph API only lists media for the authenticated account, so this
 * provider is own-account only: it requires the credential that owns the
 * handle and never serves third-party timelines (those stay on Apify).
 * Pagination walks `/{ig-user-id}/media` newest-first until the requested
 * limit or the `since` window is reached; insights are dropped (not the whole
 * page) when the account lacks the insights scope.
 */
@Injectable()
export class InstagramOfficialProvider implements SourceTimelineProvider {
  readonly name = 'brand-oauth' as const;
  readonly platforms = [SocialSourcePlatform.INSTAGRAM] as const;

  constructor(
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
  ) {}

  async canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean> {
    return (
      platform === SocialSourcePlatform.INSTAGRAM &&
      Boolean(context.organizationId) &&
      Boolean(context.brandId) &&
      Boolean(context.credentialId)
    );
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    if (!context.organizationId || !context.brandId || !context.credentialId) {
      throw new Error(
        'Instagram official provider requires organizationId, brandId and credentialId',
      );
    }
    const credential = await this.instagramService.getValidCredential(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    const igUserId = credential.externalId;
    if (!igUserId) {
      throw new Error(
        'Instagram credential is missing its professional account id',
      );
    }
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, context.limit ?? DEFAULT_LIMIT),
    );

    let posts: CollectedSourcePost[];
    try {
      posts = await this.paginate(
        accessToken,
        igUserId,
        handle,
        limit,
        context,
        true,
      );
    } catch (error: unknown) {
      if (!isInsightsError(error)) {
        throw error;
      }
      posts = await this.paginate(
        accessToken,
        igUserId,
        handle,
        limit,
        context,
        false,
      );
    }

    return {
      handle,
      platform,
      posts,
      provider: 'brand-oauth',
    };
  }

  private async paginate(
    accessToken: string,
    igUserId: string,
    handle: string,
    limit: number,
    context: SourceCollectContext,
    isInsightsIncluded: boolean,
  ): Promise<CollectedSourcePost[]> {
    const collected: CollectedSourcePost[] = [];
    let after: string | undefined;

    while (collected.length < limit) {
      const page = await this.fetchPage(
        accessToken,
        igUserId,
        isInsightsIncluded,
        after,
      );
      const nodes = Array.isArray(page.data) ? page.data : [];
      if (nodes.length === 0) {
        break;
      }

      let isWindowExhausted = false;
      for (const node of nodes) {
        const post = mapMediaNode(node, handle, igUserId);
        if (!post) {
          continue;
        }
        if (context.sinceId && post.id === context.sinceId) {
          isWindowExhausted = true;
          break;
        }
        if (
          context.since &&
          post.createdAt &&
          post.createdAt.getTime() < context.since.getTime()
        ) {
          isWindowExhausted = true;
          break;
        }
        collected.push(post);
        if (collected.length >= limit) {
          break;
        }
      }

      after = readString(page.paging?.cursors?.after);
      if (isWindowExhausted || !after || !readString(page.paging?.next)) {
        break;
      }
    }

    return collected;
  }

  private async fetchPage(
    accessToken: string,
    igUserId: string,
    isInsightsIncluded: boolean,
    after: string | undefined,
  ): Promise<InstagramGraphMediaPage> {
    const response = await firstValueFrom(
      this.httpService.get<InstagramGraphMediaPage>(
        `${GRAPH_URL}/${GRAPH_API_VERSION}/${igUserId}/media`,
        {
          params: {
            access_token: accessToken,
            ...(after ? { after } : {}),
            fields: isInsightsIncluded ? MEDIA_INSIGHTS_FIELDS : MEDIA_FIELDS,
            limit: PAGE_SIZE,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      ),
    );
    return response.data ?? {};
  }
}

/**
 * Graph rejects the whole media request when insights are requested without
 * the insights scope or on media that does not support them; retry without.
 */
function isInsightsError(error: unknown): boolean {
  const graphError = (
    error as { response?: { data?: { error?: { message?: unknown } } } }
  )?.response?.data?.error;
  const message =
    typeof graphError?.message === 'string' ? graphError.message : '';
  return /insight|permission|metric/i.test(message);
}
