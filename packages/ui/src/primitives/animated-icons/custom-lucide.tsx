import { cn } from '@genfeedai/helpers';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';

/**
 * Lucide-style static icons Lucide does not ship; each has an animated twin.
 * Written as plain SVG components rather than with `createLucideIcon`, so a
 * test that mocks `lucide-react` can still load any module that uses them.
 */
function customIcon(
  displayName: string,
  kebabName: string,
  children: ReactNode,
): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(
    (
      {
        absoluteStrokeWidth,
        className,
        color = 'currentColor',
        size = 24,
        strokeWidth = 2,
        ...props
      },
      ref,
    ) => (
      <svg
        aria-hidden="true"
        className={cn('lucide', `lucide-${kebabName}`, className)}
        fill="none"
        height={size}
        ref={ref}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={
          absoluteStrokeWidth
            ? (Number(strokeWidth) * 24) / Number(size)
            : strokeWidth
        }
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        {children}
      </svg>
    ),
  );
  Icon.displayName = displayName;
  return Icon as LucideIcon;
}

export const GalleryHorizontalStart = customIcon(
  'GalleryHorizontalStart',
  'gallery-horizontal-start',
  <>
    <path d="M22 7v10" />
    <path d="M18 5v14" />
    <rect height="18" rx="2" width="12" x="2" y="3" />
  </>,
);

/** A social post: avatar and handle over the body text. */
export const PostCard = customIcon(
  'PostCard',
  'post-card',
  <>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <circle cx="8" cy="8" r="2" />
    <path d="M12.5 7h4.5" />
    <path d="M12.5 9.5h2.5" />
    <path d="M7 14h10" />
    <path d="M7 17h6" />
  </>,
);
