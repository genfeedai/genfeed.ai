'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { isRasterPreviewUrl } from '@genfeedai/utils/media/ingredient-preview.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Spinner from '@ui/primitives/spinner';
import Image from 'next/image';

interface LightboxMediaProps {
  item: IIngredient;
  isVideo: boolean;
}

interface LightboxSlideProps extends LightboxMediaProps {
  isActive: boolean;
}

/**
 * The URL to show an ingredient from. A list row carries a media grant that is
 * still PENDING when the page loads, and the model's `ingredientUrl` is empty
 * until it is READY. The grid refreshes that grant in place; the viewer must
 * do the same instead of reading the stale row, which is what left it on a
 * placeholder with `0:00 / 0:00`.
 */
function useLightboxMedia(item: IIngredient) {
  const grant = useAuthorizedMediaPreview(item);
  const url = (grant ? grant.url : item.ingredientUrl) || undefined;
  // The model's `thumbnailUrl` getter returns a generic placeholder for every
  // video, and a grant already stands in for the poster. Only a real image
  // counts as one.
  const thumbnailUrl = grant ? undefined : item.thumbnailUrl;
  const poster =
    isRasterPreviewUrl(thumbnailUrl) &&
    !thumbnailUrl.startsWith(
      `${EnvironmentService.assetsEndpoint}/placeholders/`,
    )
      ? thumbnailUrl
      : undefined;
  const isUnavailable =
    !url && (grant?.state === 'FAILED' || grant?.state === 'UNSUPPORTED');

  return { isUnavailable, poster, url };
}

export function LightboxSlide({ isActive, isVideo, item }: LightboxSlideProps) {
  const { isUnavailable, poster, url } = useLightboxMedia(item);
  const label = item.metadataLabel || 'Media';

  if (!url) {
    return (
      <div className="flex size-full items-center justify-center bg-black text-sm text-white/70">
        {isUnavailable ? 'Media unavailable' : <Spinner />}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative flex size-full items-center justify-center bg-black">
        <VideoPlayer
          ariaLabel="Media lightbox video"
          isActive={isActive}
          src={url}
          thumbnail={poster}
          config={{
            autoPlay: false,
            controls: true,
            loop: false,
            muted: false,
            playsInline: true,
            preload: 'metadata',
          }}
          mediaProps={{ poster }}
        />
      </div>
    );
  }

  return (
    <div className="relative size-full">
      <Image
        src={url}
        alt={label}
        fill
        sizes="100vw"
        className="object-contain"
        unoptimized
      />
    </div>
  );
}

export function LightboxThumbnail({ isVideo, item }: LightboxMediaProps) {
  const { poster, url } = useLightboxMedia(item);
  // A video's grant is the video itself, which an image element cannot draw,
  // so only a real poster can stand in for it.
  const imageUrl = isVideo ? poster : url;

  if (!imageUrl) {
    return <div className="size-full bg-muted" />;
  }

  return (
    <Image
      src={imageUrl}
      alt={isVideo ? 'Video thumbnail' : (item.metadataLabel ?? 'Media')}
      fill
      sizes="96px"
      className="object-cover outline-media"
      unoptimized
    />
  );
}
