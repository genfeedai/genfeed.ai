import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import type {
  NativeActionRequest,
  TimelineCapability,
  TimelineCollectedPost,
  TimelineScope,
} from '@api/services/social-timeline/social-timeline.types';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  NativeSocialAction,
  SocialTimelineStatus,
} from '@genfeedai/contracts/interfaces';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { TwitterApi } from 'twitter-api-v2';

export function timelineCapability(
  platform: string,
  grantedScopes?: readonly string[],
): TimelineCapability {
  if (platform === CredentialPlatform.TWITTER)
    return {
      kind: 'home',
      actions: (['like', 'reply', 'repost', 'quote'] as const).filter(
        (action) =>
          !grantedScopes ||
          grantedScopes.includes(
            action === 'like' ? 'like.write' : 'tweet.write',
          ),
      ),
      message: 'Following feed, ordered by publication time.',
    };
  if (platform === CredentialPlatform.YOUTUBE)
    return {
      kind: 'subscriptions',
      actions:
        !grantedScopes ||
        grantedScopes.some((scope) =>
          [
            'https://www.googleapis.com/auth/youtube',
            'https://www.googleapis.com/auth/youtube.force-ssl',
          ].includes(scope),
        )
          ? ['like', 'comment']
          : [],
      message:
        'Latest 100 uploads from up to 200 subscriptions, checking five uploads per channel.',
    };
  return {
    kind: 'unsupported',
    actions: [],
    message:
      'This connection does not provide a home-feed API. Open your feed on the platform.',
  };
}

export function classifyTimelineError(error: unknown): {
  status: SocialTimelineStatus;
  message: string;
} {
  const record = readRecord(error);
  const response = readRecord(record.response);
  const data = readRecord(record.data);
  const status = Number(
    response.status ?? record.status ?? record.code ?? data.status,
  );
  const text = error instanceof Error ? error.message : '';
  if (
    status === 401 ||
    /invalid.grant|invalid.*token|expired.*token|reconnect|credential.*not found/i.test(
      text,
    )
  )
    return {
      status: 'reconnect',
      message: 'Reconnect this account to restore access.',
    };
  if (status === 402 || /credits|payment|usage.to.run|budget/i.test(text))
    return {
      status: 'budget_blocked',
      message: 'Provider credits or collection budget are exhausted.',
    };
  if (status === 403)
    return {
      status: 'access_required',
      message:
        'This account needs permission or API access for this operation.',
    };
  if (status === 429)
    return {
      status: 'rate_limited',
      message: 'The platform rate limit was reached. Try again later.',
    };
  return {
    status: 'failed',
    message: 'The platform request failed. Your saved feed is retained.',
  };
}

@Injectable()
export class SocialTimelineProviderService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly youtubeAuth: YoutubeAuthService,
    private readonly config: ConfigService,
  ) {}

  private async xClient(
    scope: TimelineScope,
    credentialId: string,
  ): Promise<TwitterApi> {
    let credential = await this.credentials.resolveBrandAccount({
      ...scope,
      credentialId,
      platform: CredentialPlatform.TWITTER,
    });
    if (!credential?.accessToken)
      throw new BadRequestException('Reconnect this X account.');
    if (
      credential.accessTokenExpiry &&
      credential.accessTokenExpiry.getTime() <= Date.now() + 60000
    ) {
      if (!credential.refreshToken)
        throw new BadRequestException('Reconnect this X account.');
      const oauth = new TwitterApi({
        clientId: this.config.get('TWITTER_CLIENT_ID') ?? '',
        clientSecret: this.config.get('TWITTER_CLIENT_SECRET') ?? '',
      });
      const refreshed = await oauth.refreshOAuth2Token(
        EncryptionUtil.decrypt(credential.refreshToken),
      );
      credential = await this.credentials.patch(credential.id, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessTokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
      });
    }
    if (!credential.accessToken)
      throw new BadRequestException('Reconnect this X account.');
    return new TwitterApi(EncryptionUtil.decrypt(credential.accessToken));
  }

  async collect(
    scope: TimelineScope,
    credentialId: string,
    platform: string,
  ): Promise<TimelineCollectedPost[]> {
    if (platform === CredentialPlatform.TWITTER)
      return this.xTimeline(scope, credentialId);
    if (platform === CredentialPlatform.YOUTUBE)
      return this.youtubeSubscriptions(scope, credentialId);
    throw new BadRequestException(
      'This connection has no native home-feed API.',
    );
  }

  private async xTimeline(
    scope: TimelineScope,
    credentialId: string,
  ): Promise<TimelineCollectedPost[]> {
    const client = await this.xClient(scope, credentialId);
    const me = await client.v2.me();
    const timeline = await client.v2.homeTimeline({
      max_results: 100,
      expansions: ['author_id', 'attachments.media_keys'],
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'entities',
        'attachments',
      ],
      'user.fields': ['username', 'name', 'profile_image_url'],
      'media.fields': ['url', 'preview_image_url', 'type', 'variants'],
    });
    return (timeline.data.data ?? [])
      .filter((tweet) => tweet.author_id !== me.data.id)
      .map((tweet) => {
        const author = timeline.data.includes?.users?.find(
          (user) => user.id === tweet.author_id,
        );
        const media =
          timeline.data.includes?.media?.filter((item) =>
            tweet.attachments?.media_keys?.includes(item.media_key),
          ) ?? [];
        const video = media.find(
          (item) => item.type === 'video' || item.type === 'animated_gif',
        );
        const metrics = tweet.public_metrics;
        return {
          externalId: tweet.id,
          platform: CredentialPlatform.TWITTER,
          contentType: video ? 'video' : media.length ? 'image' : 'tweet',
          text: tweet.text,
          authorId: tweet.author_id,
          authorHandle: author?.username,
          authorDisplayName: author?.name,
          authorAvatarUrl: author?.profile_image_url,
          sourceUrl: `https://x.com/${author?.username ?? 'i'}/status/${tweet.id}`,
          publishedAt: tweet.created_at,
          thumbnailUrl: media[0]?.preview_image_url ?? media[0]?.url,
          mediaUrls: media.flatMap((item) => {
            const variant = item.variants
              ?.filter((candidate) => candidate.content_type === 'video/mp4')
              .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0];
            return variant?.url ? [variant.url] : item.url ? [item.url] : [];
          }),
          metrics: {
            likes: metrics?.like_count,
            comments: metrics?.reply_count,
            reposts: metrics?.retweet_count,
            quotes: metrics?.quote_count,
          },
          hashtags: tweet.entities?.hashtags?.map((tag) => tag.tag) ?? [],
        };
      });
  }

  private async youtubeSubscriptions(
    scope: TimelineScope,
    credentialId: string,
  ): Promise<TimelineCollectedPost[]> {
    const auth = await this.youtubeAuth.refreshToken(
      scope.organizationId,
      scope.brandId,
      credentialId,
    );
    const api = google.youtube({ version: 'v3', auth });
    const channelIds: string[] = [];
    let pageToken: string | undefined;
    // Bound each explicit refresh to 200 subscriptions and 5 uploads/channel.
    do {
      const response = await api.subscriptions.list({
        part: ['snippet'],
        mine: true,
        maxResults: 50,
        pageToken,
      });
      channelIds.push(
        ...(response.data.items ?? []).flatMap((item) =>
          item.snippet?.resourceId?.channelId
            ? [item.snippet.resourceId.channelId]
            : [],
        ),
      );
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken && channelIds.length < 200);
    const playlists: string[] = [];
    for (let offset = 0; offset < channelIds.length; offset += 50) {
      const response = await api.channels.list({
        part: ['contentDetails'],
        id: channelIds.slice(offset, offset + 50),
      });
      playlists.push(
        ...(response.data.items ?? []).flatMap((item) =>
          item.contentDetails?.relatedPlaylists?.uploads
            ? [item.contentDetails.relatedPlaylists.uploads]
            : [],
        ),
      );
    }
    const posts: TimelineCollectedPost[] = [];
    // Limit concurrency to five requests to respect the provider quota.
    for (let offset = 0; offset < playlists.length; offset += 5) {
      const responses = await Promise.all(
        playlists.slice(offset, offset + 5).map((playlistId) =>
          api.playlistItems.list(
            {
              part: ['snippet', 'contentDetails'],
              playlistId,
              maxResults: 5,
            },
            { timeout: 15000 },
          ),
        ),
      );
      for (const response of responses) {
        for (const item of response.data.items ?? []) {
          const id = item.contentDetails?.videoId;
          const snippet = item.snippet;
          if (!id || !snippet || !item.contentDetails?.videoPublishedAt)
            continue;
          posts.push({
            externalId: id,
            platform: CredentialPlatform.YOUTUBE,
            contentType: 'video',
            text: snippet.title,
            authorId: snippet.videoOwnerChannelId ?? undefined,
            authorDisplayName: snippet.videoOwnerChannelTitle ?? undefined,
            authorHandle: snippet.videoOwnerChannelTitle ?? undefined,
            sourceUrl: `https://www.youtube.com/watch?v=${id}`,
            thumbnailUrl: snippet.thumbnails?.high?.url ?? undefined,
            mediaUrls: [`https://www.youtube.com/watch?v=${id}`],
            publishedAt: item.contentDetails.videoPublishedAt,
          });
        }
      }
    }
    return posts
      .sort(
        (a, b) =>
          Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''),
      )
      .slice(0, 100);
  }

  async execute(
    scope: TimelineScope,
    credentialId: string,
    platform: string,
    input: NativeActionRequest,
  ): Promise<string | null> {
    if (
      !timelineCapability(platform).actions.includes(
        input.action as NativeSocialAction,
      )
    )
      throw new BadRequestException(
        'This action is not available for this platform.',
      );
    if (platform === CredentialPlatform.TWITTER) {
      const client = await this.xClient(scope, credentialId);
      if (input.action === 'like' || input.action === 'repost') {
        const me = await client.v2.me();
        if (input.action === 'like')
          await client.v2.like(me.data.id, input.externalId);
        else await client.v2.retweet(me.data.id, input.externalId);
        return input.externalId;
      }
      const result = await client.v2.tweet({
        text: input.text ?? '',
        ...(input.action === 'reply'
          ? { reply: { in_reply_to_tweet_id: input.externalId } }
          : { quote_tweet_id: input.externalId }),
      });
      return result.data.id;
    }
    const auth = await this.youtubeAuth.refreshToken(
      scope.organizationId,
      scope.brandId,
      credentialId,
    );
    const api = google.youtube({ version: 'v3', auth });
    if (input.action === 'like') {
      await api.videos.rate({ id: input.externalId, rating: 'like' });
      return input.externalId;
    }
    const result = await api.commentThreads.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId: input.externalId,
          topLevelComment: { snippet: { textOriginal: input.text } },
        },
      },
    });
    return result.data.id ?? null;
  }
}
