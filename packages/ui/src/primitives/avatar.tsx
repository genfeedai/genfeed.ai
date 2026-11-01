'use client';

import { cn, getInitials } from '@genfeedai/helpers';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { VariantProps } from 'class-variance-authority';
import type {
  ComponentPropsWithRef,
  ImgHTMLAttributes,
  ReactNode,
} from 'react';
import { avatarBadgeVariants, avatarVariants } from './avatar.variants';

export interface AvatarProps
  extends ComponentPropsWithRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  /** Picture URL. When it is missing or fails to load, the fallback shows. */
  src?: string | null;
  /** Who or what this is. Initials come from it when there is no picture. */
  name?: string | null;
  /** Alt text for the picture. Leave empty when the name is written beside it. */
  alt?: string;
  /** Replaces the initials, for an icon or a platform logo. */
  fallback?: ReactNode;
  /** Small mark on the bottom-right corner, such as a platform badge. */
  badge?: ReactNode;
  /** Drawn over the picture and clipped to the frame, such as edit actions. */
  children?: ReactNode;
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
  onLoadingStatusChange?: (
    status: 'idle' | 'loading' | 'loaded' | 'error',
  ) => void;
}

function Avatar({
  alt = '',
  badge,
  children,
  className,
  fallback,
  name,
  onLoadingStatusChange,
  ref,
  referrerPolicy,
  shape,
  size,
  src,
  ...props
}: AvatarProps) {
  const avatar = (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(avatarVariants({ shape, size }), !badge && className)}
      data-shape={shape ?? 'circle'}
      data-size={size ?? 'lg'}
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image
          alt={alt}
          className="aspect-square size-full object-cover outline-media"
          onLoadingStatusChange={onLoadingStatusChange}
          referrerPolicy={referrerPolicy}
          src={src}
        />
      ) : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
        {fallback ?? getInitials(name)}
      </AvatarPrimitive.Fallback>
      {children}
    </AvatarPrimitive.Root>
  );

  if (!badge) {
    return avatar;
  }

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {avatar}
      <span className={avatarBadgeVariants({ size })} data-slot="avatar-badge">
        {badge}
      </span>
    </span>
  );
}
Avatar.displayName = AvatarPrimitive.Root.displayName;

export { Avatar };
