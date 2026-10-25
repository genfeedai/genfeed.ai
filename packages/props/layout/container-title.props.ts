import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface ContainerTitleProps {
  title: ReactNode;
  icon?: IconComponent | ReactNode;
  titleVisibility?: 'visible' | 'sr-only';
}
