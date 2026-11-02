import { cn } from '@genfeedai/helpers';
import type {
  ContentFeedItem,
  ContentFeedProps,
} from '@genfeedai/props/components/content-feed.props';
import type { PlatformPreviewTarget } from '@genfeedai/props/components/platform-preview.props';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';

function toTarget(
  item: ContentFeedItem,
  author: PlatformPreviewTarget['author'],
): PlatformPreviewTarget {
  return {
    author,
    caption: item.text,
    id: item.id,
    media: item.media.map((media, index) => ({
      id: `${item.id}-media-${index + 1}`,
      kind: media.kind,
      url: media.url,
    })),
    platform: item.platform,
  };
}

/**
 * One brand's posts as a single column, each drawn the way its platform shows
 * it. The public profile and the claimable preview page both render this, so a
 * post looks the same wherever someone meets it. Display only: no validation,
 * no publishing state.
 */
export default function ContentFeed({
  authorAvatarUrl,
  authorHandle,
  authorName,
  className,
  emptyMessage,
  items,
  statusLabel,
}: ContentFeedProps) {
  const author = {
    avatarUrl: authorAvatarUrl,
    handle: authorHandle,
    name: authorName,
  };

  return (
    <div
      className={cn('mx-auto flex w-full max-w-xl flex-col gap-5', className)}
      data-testid="content-feed"
    >
      {items.length === 0 ? (
        <PlatformPreview emptyMessage={emptyMessage} targets={[]} />
      ) : (
        items.map((item) => (
          <PlatformPreview
            headerPresentation="account"
            key={item.id}
            presentation="full"
            showValidation={false}
            statusLabel={statusLabel}
            target={toTarget(item, author)}
          />
        ))
      )}
    </div>
  );
}
