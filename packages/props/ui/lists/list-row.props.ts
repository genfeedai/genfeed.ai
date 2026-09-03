import type { ReactNode } from 'react';

export type ListRowDensity = 'compact' | 'comfortable';

interface ListRowBaseProps {
  /** Optional leading slot — state dot, icon, or PlatformBadge. */
  leading?: ReactNode;
  /** Primary row label. Always truncated to one line. */
  title: ReactNode;
  /** Secondary copy under the title, clamped to two lines. */
  description?: ReactNode;
  /** Small metadata line under the title/description (timestamp, counts). */
  meta?: ReactNode;
  /** Trailing slot — badges, actions. Never centered, always shrink-0. */
  trailing?: ReactNode;
  className?: string;
  /** `compact` = px-4 py-3, `comfortable` (default) = p-4. */
  density?: ListRowDensity;
  'data-testid'?: string;
}

export interface ListRowButtonProps extends ListRowBaseProps {
  onClick: () => void;
  ariaLabel: string;
  href?: undefined;
}

export interface ListRowLinkProps extends ListRowBaseProps {
  href: string;
  onClick?: undefined;
  ariaLabel?: string;
}

export interface ListRowStaticProps extends ListRowBaseProps {
  onClick?: undefined;
  href?: undefined;
  ariaLabel?: string;
}

export type ListRowProps =
  | ListRowButtonProps
  | ListRowLinkProps
  | ListRowStaticProps;

export interface ListRowsSkeletonProps {
  rows?: number;
  'data-testid'?: string;
}
