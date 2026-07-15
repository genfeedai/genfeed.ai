import type {
  AdsResearchItem,
  ISourcePost,
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
  ResearchFindingReference,
  ResearchFindingReferenceKind,
} from '@genfeedai/interfaces';
import type { TrendContentItem } from '@props/trends/trends-page.props';

export {
  RESEARCH_FINDING_REFERENCE_KINDS,
  type ResearchFindingReference,
  type ResearchFindingReferenceKind,
} from '@genfeedai/interfaces';

export interface ResearchFindingMetadataItem {
  readonly label: string;
  readonly value: string;
}

export interface AuthorizedResearchFinding {
  readonly description?: string;
  readonly metadata: readonly ResearchFindingMetadataItem[];
  readonly reference: ResearchFindingReference;
  readonly title: string;
}

export function getResearchFindingReferenceKey(
  reference: ResearchFindingReference,
): string {
  return `${reference.kind}:${reference.id}`;
}

export function isSameResearchFindingReference(
  left: ResearchFindingReference | null,
  right: ResearchFindingReference | null,
): boolean {
  return Boolean(
    left && right && left.id === right.id && left.kind === right.kind,
  );
}

export function toAdsResearchFinding(
  item: AdsResearchItem,
): AuthorizedResearchFinding {
  const id = item.source === 'my_accounts' ? item.sourceId : item.id;
  const kind: ResearchFindingReferenceKind =
    item.source === 'my_accounts'
      ? item.platform === 'meta'
        ? 'research-ad-connected-meta'
        : 'research-ad-connected-google'
      : item.platform === 'meta'
        ? 'research-ad-public-meta'
        : 'research-ad-public-google';

  return {
    description:
      item.headline || item.body || item.explanation || 'Ad research finding',
    metadata: [
      {
        label: 'Platform',
        value: item.platform === 'meta' ? 'Meta' : 'Google',
      },
      {
        label: 'Source',
        value: item.source === 'my_accounts' ? 'Connected account' : 'Public',
      },
      ...(item.accountName
        ? [{ label: 'Account', value: item.accountName }]
        : []),
    ],
    reference: { id, kind },
    title: item.title,
  };
}

export function toSourcePostFinding(
  post: ISourcePost,
): AuthorizedResearchFinding {
  const title = post.text?.trim() || `${post.platform} source post`;

  return {
    description: post.text?.trim() || undefined,
    metadata: [
      { label: 'Platform', value: String(post.platform) },
      ...(post.authorHandle
        ? [{ label: 'Author', value: `@${post.authorHandle}` }]
        : []),
    ],
    reference: { id: post.id, kind: 'research-source-post' },
    title,
  };
}

export function toTrendContentFinding(
  item: TrendContentItem,
): AuthorizedResearchFinding {
  return {
    description: item.text || item.title || item.trendTopic,
    metadata: [
      { label: 'Platform', value: item.platform },
      { label: 'Trend', value: item.trendTopic },
      { label: 'Virality', value: String(item.trendViralityScore) },
    ],
    reference: { id: item.id, kind: 'research-trend-content' },
    title: item.title || item.text || item.trendTopic,
  };
}

export function toTrendVideoFinding(
  video: ITrendVideo,
): AuthorizedResearchFinding {
  return {
    description: video.description || video.hook || video.topic,
    metadata: [
      { label: 'Platform', value: video.platform },
      { label: 'Viral score', value: String(Math.round(video.viralScore)) },
      ...(video.creatorHandle
        ? [{ label: 'Creator', value: `@${video.creatorHandle}` }]
        : []),
    ],
    reference: { id: video.id, kind: 'research-trend-video' },
    title: video.title || video.hook || 'Untitled video',
  };
}

export function toTrendHashtagFinding(
  hashtag: ITrendHashtag,
): AuthorizedResearchFinding {
  return {
    metadata: [
      { label: 'Platform', value: hashtag.platform },
      {
        label: 'Virality',
        value: String(Math.round(hashtag.viralityScore)),
      },
    ],
    reference: { id: hashtag.id, kind: 'research-trend-hashtag' },
    title: hashtag.hashtag,
  };
}

export function toTrendSoundFinding(
  sound: ITrendSound,
): AuthorizedResearchFinding {
  return {
    description: sound.authorName,
    metadata: [
      { label: 'Platform', value: sound.platform },
      { label: 'Uses', value: String(sound.usageCount) },
      { label: 'Virality', value: String(Math.round(sound.viralityScore)) },
    ],
    reference: { id: sound.id, kind: 'research-trend-sound' },
    title: sound.soundName || 'Untitled sound',
  };
}
