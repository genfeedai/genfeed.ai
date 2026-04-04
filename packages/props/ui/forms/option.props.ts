import type { ReactNode } from 'react';

export interface OptionProps {
  value: string | number;
  disabled?: boolean;
  children: ReactNode;
}
