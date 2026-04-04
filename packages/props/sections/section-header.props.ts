import type { ComponentType, ReactNode } from 'react';

export type SectionHeaderSize = 'sm' | 'md' | 'lg' | 'xl';
export type SectionHeaderAlign = 'left' | 'center';

export interface SectionHeaderProps {
  /** Optional icon displayed next to label */
  icon?: ComponentType<{ className?: string }>;
  /** Optional eyebrow/badge text above title */
  label?: string;
  /** Main headline - supports JSX for styled spans */
  title: ReactNode;
  /** Supporting description text */
  description?: string;
  /** Text alignment */
  align?: SectionHeaderAlign;
  /** Size variant affecting typography */
  size?: SectionHeaderSize;
  /** Additional CSS classes */
  className?: string;
}
