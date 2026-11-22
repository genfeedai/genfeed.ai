import type {
  TwitterTimelinePost,
  TwitterTimelineResponse,
} from '@api/services/integrations/twitter/services/twitter-native-timeline.types';
import type {
  TwitterMappedUser,
  TwitterResponseMapper,
} from '@api/services/integrations/twitter/services/twitter-response.mapper';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

type TimelineMedia = NonNullable<
  NonNullable<TwitterTimelineResponse['includes']>['media']
>[number];

/** What the signal card shows: the best mp4 for video, the photo url for images. */
function projectTimelineMedia(media: readonly (TimelineMedia | undefined)[]) {
  const attached = media.filter((item): item is TimelineMedia => Boolean(item));
  const hasVideo = attached.some(
    (item) => item.type === 'video' || item.type === 'animated_gif',
  );
  const mediaUrls = attached.flatMap((item) => {
    const variant = item.variants
      ?.filter((candidate) => candidate.content_type === 'video/mp4')
      .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0];
    const url = variant?.url ?? item.url;
    return url ? [url] : [];
  });
  const thumbnailUrl = attached[0]?.preview_image_url ?? attached[0]?.url;

  return {
    contentType: hasVideo
      ? ('video' as const)
      : attached.length > 0
        ? ('image' as const)
        : ('tweet' as const),
    mediaUrls,
    thumbnailUrl,
  };
}

/** Preserve normal timeline projection; add separate evidence only on explicit capture. */
export function mapTwitterTimeline(
  result: Readonly<TwitterTimelineResponse>,
  user: Readonly<TwitterMappedUser>,
  mapper: Pick<TwitterResponseMapper, 'mapAnalytics'>,
  captureEvidence: boolean,
): TwitterTimelinePost[] {
  const authors = new Map(
    (result.includes?.users ?? []).map((author) => [author.id, author]),
  );

  return (result.data ?? []).map((tweet) => {
    const author = authors.get(tweet.author_id ?? user.id);
    const isRetweet = Boolean(
      tweet.referenced_tweets?.some((ref) => ref.type === 'retweeted'),
    );
    const keys = tweet.attachments?.media_keys ?? [];
    const media = keys.map((key) =>
      result.includes?.media?.find((item) => item.media_key === key),
    );
    const nativeFormat: LearningFormat | undefined = media.some((item) => !item)
      ? undefined
      : keys.length === 0
        ? 'text'
        : media.every((item) => item?.type === 'photo')
          ? keys.length > 1
            ? 'carousel'
            : 'image'
          : media.length === 1 && media[0]?.type === 'video'
            ? 'video'
            : undefined;
    return {
      ...(captureEvidence
        ? {
            nativeFormat,
            nativeAuthorVerified:
              typeof tweet.author_id === 'string' &&
              tweet.author_id === user.id,
            attachmentMediaKeys: keys,
            breakoutExposures: mapper.mapAnalytics({
              data: [tweet],
            }).breakoutExposures,
          }
        : {}),
      ...projectTimelineMedia(media),
      authorAvatarUrl: author?.profile_image_url ?? user.profileImageUrl,
      authorFollowersCount:
        author?.public_metrics?.followers_count ?? user.followersCount,
      authorId: tweet.author_id ?? user.id,
      authorName: author?.name ?? user.name,
      authorUsername: author?.username ?? user.username,
      createdAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      id: tweet.id,
      inReplyToId: tweet.in_reply_to_user_id ?? null,
      isRetweet,
      metrics: tweet.public_metrics
        ? {
            comments: tweet.public_metrics.reply_count ?? 0,
            likes: tweet.public_metrics.like_count ?? 0,
            shares: tweet.public_metrics.retweet_count ?? 0,
          }
        : undefined,
      text: tweet.text ?? '',
    };
  });
}
