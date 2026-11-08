import { CardGap } from '@genfeedai/contracts';
import { getPlatformDisplayName } from '@genfeedai/contracts/constants';
import type { LockedPostListProps } from '@props/pages/invite-profile.props';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Lock } from 'lucide-react';
import Image from 'next/image';

/**
 * The posts prepared for a lead, shown read-only and marked locked. The
 * website mounts no translation provider, so this list draws the posts itself
 * instead of using the app's translated platform preview.
 */
export default function LockedPostList({
  emptyMessage,
  items,
}: LockedPostListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <Card as="li" gap={CardGap.SM} key={item.id}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Post for {getPlatformDisplayName(item.platform)}</span>
            <span className="flex items-center gap-1">
              <Lock aria-hidden="true" className="size-3" />
              Locked
            </span>
          </div>
          {item.text ? (
            <p className="whitespace-pre-line text-sm text-foreground">
              {item.text}
            </p>
          ) : null}
          {item.media.map((media) =>
            media.kind === 'video' ? (
              <VideoPlayer
                ariaLabel={`Video for ${getPlatformDisplayName(item.platform)}`}
                className="overflow-hidden rounded-md"
                key={media.url}
                src={media.url}
              />
            ) : (
              <div
                className="relative aspect-square overflow-hidden rounded-md"
                key={media.url}
              >
                <Image
                  alt={`Image for ${getPlatformDisplayName(item.platform)}`}
                  className="object-cover"
                  fill
                  sizes="(min-width: 768px) 28rem, 100vw"
                  src={media.url}
                />
              </div>
            ),
          )}
        </Card>
      ))}
    </ul>
  );
}
