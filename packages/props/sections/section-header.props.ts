import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export type SectionHeaderSize = 'sm' | 'md' | 'lg' | 'xl';
export type SectionHeaderAlign = 'left' | 'center';

export interface SectionHeaderProps {
  /** Optional icon displayed next to label */
  icon?: IconComponent;
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
  className?: string;
}
