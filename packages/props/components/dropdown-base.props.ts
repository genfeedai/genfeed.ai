import type { ReactNode } from 'react';

export interface DropdownBaseProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  minWidth?: string;
  maxWidth?: string;
  position?: 'bottom-full' | 'top-full' | 'auto';
  usePortal?: boolean;
}
