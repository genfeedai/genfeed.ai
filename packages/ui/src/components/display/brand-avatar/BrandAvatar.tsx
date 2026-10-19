'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { BrandAvatarProps } from '@genfeedai/props/ui/display/brand-avatar.props';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';

const AVATAR_SIZE_CLASSNAME = {
  lg: 'size-10',
  md: 'size-8',
  sm: 'size-6',
} as const;

const FALLBACK_TEXT_CLASSNAME = {
  lg: 'text-sm',
  md: 'text-xs',
  sm: 'text-2xs',
} as const;

/**
 * A brand's logo in a circle, or its first letter when it has none. Use it
 * wherever a list names a brand so every brand reads the same.
 */
export default function BrandAvatar({
  className,
  logoUrl,
  name,
  size = 'md',
}: BrandAvatarProps) {
  return (
    <Avatar
      className={cn(
        AVATAR_SIZE_CLASSNAME[size],
        'bg-background-secondary shadow-border',
        className,
      )}
    >
      {logoUrl ? (
        <AvatarImage alt={name} className="object-cover" src={logoUrl} />
      ) : null}
      <AvatarFallback
        className={cn(
          FALLBACK_TEXT_CLASSNAME[size],
          'font-semibold text-foreground/70',
        )}
      >
        {name.trim().charAt(0).toUpperCase() || '-'}
      </AvatarFallback>
    </Avatar>
  );
}
