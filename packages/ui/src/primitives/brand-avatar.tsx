'use client';

import { Avatar, type AvatarProps } from './avatar';

export type BrandAvatarSize = Exclude<NonNullable<AvatarProps['size']>, 'fill'>;

export interface BrandAvatarProps
  extends Omit<AvatarProps, 'fallback' | 'isFramed' | 'shape' | 'size'> {
  size?: BrandAvatarSize;
}

/**
 * A brand's logo tile. One frame everywhere a brand is shown (switchers,
 * lists, the brand profile, the public profile): square corners from the size
 * scale, and the same hairline border whether the tile shows the logo or the
 * initials fallback. Call sites pick `size`; they never restyle the frame.
 */
function BrandAvatar({ size = 'lg', ...props }: BrandAvatarProps) {
  return <Avatar {...props} isFramed shape="square" size={size} />;
}
BrandAvatar.displayName = 'BrandAvatar';

export { BrandAvatar };
