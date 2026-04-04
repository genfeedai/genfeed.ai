import type { ComponentType, ReactNode } from 'react';

export interface ContainerTitleProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }> | ReactNode;
}
