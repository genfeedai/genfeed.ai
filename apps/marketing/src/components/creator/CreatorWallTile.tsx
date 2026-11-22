import { creatorPostPath } from '@genfeedai/contracts/constants';
import {
  getPostMedia,
  postPlatformLabel,
  postTitle,
  toPlainPostText,
} from '@genfeedai/helpers/content/public-post.helper';
import type { CreatorWallTileProps } from '@props/content/creator.props';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Badge } from '@ui/primitives/badge';
import { focusRingClassName } from '@ui/primitives/focus-ring';
import { Layers, Play } from 'lucide-react';
import Link from 'next/link';
import CreatorPostMetrics from './CreatorPostMetrics';

const TILE_CLASS = `group relative block aspect-[4/5] overflow-hidden rounded-lg bg-card outline-media ${focusRingClassName}`;

// Marks and captions sit on the creator's own picture, so they stay light on
// dark in both themes rather than following the page theme.
const MARK_CLASS =
  'bg-black/60 text-white backdrop-blur' /* design-system-allow-content-color -- overlay on the creator's media */;
const CAPTION_CLASS =
  'bg-gradient-to-t from-black/80 to-transparent text-white' /* design-system-allow-content-color -- overlay on the creator's media */;

const postDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/**
 * One post on the wall: its first picture or frame, the platform it went out
 * on, and a caption on hover. A post with no media (a tweet, a thread) is a
 * text tile worn by the creator's connected account.
 */
export default function CreatorWallTile({
  brand,
  handle,
  post,
}: CreatorWallTileProps): React.ReactElement {
  const text = toPlainPostText(post.description);
  const title = postTitle(post.label, text);
  const platformLabel = postPlatformLabel(post.platform);
  const publishedAt = post.publishedAt ?? post.createdAt;
  const media = getPostMedia(post.ingredients);
  const lead = media[0];
  // The account that published the post; a post with no matching connected
  // account falls back to the profile handle.
  const accountHandle =
    brand.socials?.find((social) => social.platform === post.platform)
      ?.handle ?? handle;
  const label = `${platformLabel ? `${platformLabel}: ` : ''}${title}`;

  if (!lead) {
    return (
      <Link
        aria-label={label}
        className={`${TILE_CLASS} flex flex-col justify-between border border-border p-4 transition-colors hover:border-border-strong`}
        href={creatorPostPath(handle, post.id)}
      >
        <p className="line-clamp-8 text-sm leading-6 text-foreground">
          {text || title}
        </p>
        <span className="flex items-center gap-2.5 text-xs text-foreground/50">
          <ConnectedAccountAvatar
            account={{
              avatarUrl: brand.logoUrl,
              handle: accountHandle,
              platform: post.platform ?? '',
            }}
            isDecorative
            size="sm"
          />
          <span className="min-w-0 truncate">@{accountHandle}</span>
          {publishedAt ? (
            <time className="ml-auto shrink-0" dateTime={publishedAt}>
              {postDateFormatter.format(new Date(publishedAt))}
            </time>
          ) : null}
        </span>
      </Link>
    );
  }

  return (
    <Link
      aria-label={label}
      className={TILE_CLASS}
      href={creatorPostPath(handle, post.id)}
    >
      {lead.kind === 'video' ? (
        <video
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          muted
          playsInline
          preload="metadata"
          src={`${lead.url}#t=0.1`}
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: media URLs are signed per request, so next/image cannot cache them.
        <img
          alt=""
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          src={lead.url}
        />
      )}
      {post.platform ? (
        <PlatformBadge
          className="absolute left-2 top-2"
          platform={post.platform}
          showLabel={false}
          variant="solid"
        />
      ) : null}
      <span className="absolute right-2 top-2 flex gap-1.5">
        {media.length > 1 ? (
          <Badge
            icon={<Layers aria-hidden="true" className="size-3.5" />}
            isSolid
            shape="pill"
            value={media.length}
            variant="secondary"
          />
        ) : null}
        {lead.kind === 'video' ? (
          <span
            className={`inline-flex size-6 items-center justify-center rounded-full ${MARK_CLASS}`}
          >
            <Play aria-hidden="true" className="size-3.5 fill-current" />
          </span>
        ) : null}
      </span>
      <span
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3 pt-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 ${CAPTION_CLASS}`}
      >
        <span className="line-clamp-2 text-sm font-semibold leading-snug">
          {title}
        </span>
        <span className="text-xs opacity-80">
          <CreatorPostMetrics post={post} />
        </span>
      </span>
    </Link>
  );
}
