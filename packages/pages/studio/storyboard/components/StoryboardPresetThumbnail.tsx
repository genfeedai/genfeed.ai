import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardPresetThumbnailProps } from '@genfeedai/props/studio/storyboard-presets.props';
import Image from 'next/image';
import type { ReactElement } from 'react';

/** Decorative 16:9 storyboard-sheet thumbnail; the adjacent title names it. */
export default function StoryboardPresetThumbnail({
  src,
  className,
}: StoryboardPresetThumbnailProps): ReactElement {
  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden bg-muted/40',
        className,
      )}
    >
      <Image
        alt=""
        className="object-cover"
        fill
        loading="lazy"
        sizes="(min-width: 1280px) 20rem, (min-width: 640px) 33vw, 100vw"
        src={src}
      />
    </div>
  );
}
