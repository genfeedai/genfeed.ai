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
const DISCOVERY_MEDIA_LIMIT = 50;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 15_000;

const DISCOVERY_MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

interface InstagramDiscoveryMediaNode {
  caption?: unknown;
  comments_count?: unknown;
  id?: unknown;
  like_count?: unknown;
  media_product_type?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  permalink?: unknown;
  thumbnail_url?: unknown;
  timestamp?: unknown;
}

interface InstagramBusinessDiscovery {
  followers_count?: unknown;
  id?: unknown;
  media?: { data?: InstagramDiscoveryMediaNode[] };
  media_count?: unknown;
  name?: unknown;
  username?: unknown;
}

interface InstagramBusinessDiscoveryResponse {
  business_discovery?: InstagramBusinessDiscovery;
  id?: unknown;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function toContentType(node: InstagramDiscoveryMediaNode): string {
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

function mapDiscoveryNode(
  node: InstagramDiscoveryMediaNode,
  discovery: InstagramBusinessDiscovery,
): CollectedSourcePost | undefined {
  const id = readString(node.id);
  if (!id) {
    return undefined;
  }
  const timestamp = readString(node.timestamp);
  const mediaUrl = readString(node.media_url);
  const thumbnailUrl = readString(node.thumbnail_url) ?? mediaUrl;

  return {
    authorDisplayName: readString(discovery.name),
    authorFollowersCount: readCount(discovery.followers_count),
    authorId: readString(discovery.id),
    authorUsername: readString(discovery.username),
    contentType: toContentType(node),
    contentUrl: readString(node.permalink),
    createdAt: timestamp ? new Date(timestamp) : undefined,
    id,
    mediaUrls: mediaUrl ? [mediaUrl] : [],
    metrics: {
      comments: readCount(node.comments_count),
      likes: readCount(node.like_count),
    },
    platform: SocialSourcePlatform.INSTAGRAM,
    text: readString(node.caption) ?? '',
    thumbnailUrl,
  };
}

/**
 * Graph Business Discovery provider for a competitor's professional
 * Instagram account (someone else's handle, read through the brand's own
 * connected credential — no separate authorization from the target needed).
 *
 * Business Discovery only exposes one nested `media` edge per request and
 * does not accept a top-level `after` cursor the way `/{ig-user-id}/media`
 * does; the nested edge does support `media.after(cursor)` in Graph's docs,
 * but that has not been exercised against a live account from this repo, so
 * this provider fetches a single bounded page (`media.limit(50)`, Graph's
 * per-edge cap) rather than risk pagination that silently drops or repeats
 * posts. Revisit with a confirmed cursor contract before raising the ceiling
 * above one page.
 *
 * Graph rejects Business Discovery for accounts that are not Instagram
 * professional (business/creator) accounts — this provider throws in that
 * case so the chain falls back to Apify.
 */
@Injectable()
export class InstagramBusinessDiscoveryProvider
  implements SourceTimelineProvider
{
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
      Boolean(context.brandId)
    );
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    if (!context.organizationId || !context.brandId) {
      throw new Error(
        'Instagram Business Discovery provider requires organizationId and brandId',
      );
    }
    const credential = await this.instagramService.getValidCredential(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, context.limit ?? DEFAULT_LIMIT),
    );

    const response = await firstValueFrom(
      this.httpService.get<InstagramBusinessDiscoveryResponse>(
        `${GRAPH_URL}/${GRAPH_API_VERSION}/${credential.externalId}`,
        {
          params: {
            access_token: accessToken,
            fields: `business_discovery.username(${handle}){id,username,name,followers_count,media_count,media.limit(${DISCOVERY_MEDIA_LIMIT}){${DISCOVERY_MEDIA_FIELDS}}}`,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      ),
    );

    const discovery = response.data?.business_discovery;
    if (!discovery) {
      throw new Error(
        `Instagram Business Discovery returned no data for @${handle}`,
      );
    }

    const nodes = Array.isArray(discovery.media?.data)
      ? discovery.media.data
      : [];

    const posts: CollectedSourcePost[] = [];
    for (const node of nodes) {
      const post = mapDiscoveryNode(node, discovery);
      if (!post) {
        continue;
      }
      if (context.sinceId && post.id === context.sinceId) {
        break;
      }
      if (
        context.since &&
        post.createdAt &&
        post.createdAt.getTime() < context.since.getTime()
      ) {
        break;
      }
      posts.push(post);
      if (posts.length >= limit) {
        break;
      }
    }

    return {
      handle: readString(discovery.username) ?? handle,
      platform,
      posts,
      provider: 'brand-oauth',
    };
  }
}
