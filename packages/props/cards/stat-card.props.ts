import type { ComponentType, ReactNode } from 'react';

export type StatCardVariant = 'default' | 'white' | 'black';
export type StatCardSize = 'sm' | 'md' | 'lg' | 'xl';

export interface StatCardProps {
  /** Label/title for the stat */
  label: string;
  /** Main value to display */
  value: ReactNode;
  /** Optional description or subtitle */
  description?: string;
  /** Optional icon component */
  icon?: ComponentType<{ className?: string }>;
  /** Card variant */
  variant?: StatCardVariant;
  /** Card size */
  size?: StatCardSize;
  /** Optional trend value (positive = up, negative = down) */
  trend?: number;
  /** Additional CSS classes */
  className?: string;
  /** Show loading state for value */
  isLoading?: boolean;
}
