import type { ReactNode } from 'react';

export type SelectCardButtonProps = {
  isSelected: boolean;
  onClick: () => void;
  children: ReactNode;
};
