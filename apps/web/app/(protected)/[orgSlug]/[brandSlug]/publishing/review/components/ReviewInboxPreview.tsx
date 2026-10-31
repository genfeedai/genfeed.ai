import type { IReviewInboxItemPreview } from '@genfeedai/contracts/interfaces';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { isReviewInboxVideoUrl } from './review-inbox.helpers';

/**
 * What an approval would post or generate: its media and caption. The media
 * URL comes from the requester, so the image skips the optimizer's host list.
 */
export default function ReviewInboxPreview({
  preview,
}: {
  preview: IReviewInboxItemPreview;
}) {
  const translate = useTranslations('pages.publishing.review.inbox');
  const { caption, mediaUrl } = preview;

  if (!caption && !mediaUrl) {
    return (
      <span className="text-xs text-muted-foreground">
        {translate('noPreview')}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-start gap-3">
      {mediaUrl ? (
        <span className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-md bg-card shadow-border">
          {isReviewInboxVideoUrl(mediaUrl) ? (
            <VideoPlayer
              ariaLabel={translate('previewVideo')}
              className="size-full"
              config={{
                controls: true,
                loop: false,
                muted: true,
                playsInline: true,
                preload: 'metadata',
              }}
              src={mediaUrl}
            />
          ) : (
            <Image
              alt={translate('previewImage')}
              className="object-cover outline-media"
              fill
              sizes="96px"
              src={mediaUrl}
              unoptimized
            />
          )}
        </span>
      ) : null}
      {caption ? (
        <span className="line-clamp-4 min-w-0 whitespace-pre-line text-sm text-foreground">
          {caption}
        </span>
      ) : null}
    </span>
  );
}
