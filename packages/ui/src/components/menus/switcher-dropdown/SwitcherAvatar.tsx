'use client';

import type { SwitcherAvatarProps } from '@genfeedai/props/ui/menus/switcher-avatar.props';
import Image from 'next/image';
import { useState } from 'react';

/**
 * Logo tile for the org and brand switchers. Signed media URLs expire and
 * brand state outlives them, so a logo that fails to load falls back to the
 * letter tile instead of showing a broken image, and tells the owner so it can
 * fetch a fresh URL (a new URL renders the logo again).
 */
export default function SwitcherAvatar({
  alt,
  fallbackClassName,
  imageUrl,
  imageWrapperClassName,
  letter,
  onImageError,
}: SwitcherAvatarProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  if (!imageUrl || failedImageUrl === imageUrl) {
    return <div className={fallbackClassName}>{letter}</div>;
  }

  return (
    <div className={imageWrapperClassName}>
      <Image
        src={imageUrl}
        alt={alt}
        width={20}
        height={20}
        className="size-full object-cover object-center"
        sizes="20px"
        onError={() => {
          setFailedImageUrl(imageUrl);
          onImageError?.();
        }}
      />
    </div>
  );
}
