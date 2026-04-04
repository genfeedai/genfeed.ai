export type TrendBadgeSize = 'sm' | 'md' | 'lg';

export interface TrendBadgeProps {
  /** The trend value (positive = up, negative = down, 0 = neutral) */
  value: number;
  /** Optional label to show after the value (e.g., "vs last week") */
  label?: string;
  /** Whether to show the trend arrow icon */
  showIcon?: boolean;
  /** Size of the badge */
  size?: TrendBadgeSize;
  /** Additional CSS classes */
  className?: string;
}
