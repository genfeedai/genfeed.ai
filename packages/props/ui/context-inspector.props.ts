import type { PropsWithChildren, ReactNode } from 'react';

export type ContextInspectorWidth = 'md' | 'lg' | 'xl' | 'full';

export interface ContextInspectorProps extends PropsWithChildren {
  readonly bodyClassName?: string;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly isOpen: boolean;
  readonly onCloseAutoFocus?: (event: Event) => void;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly title: ReactNode;
  readonly width?: ContextInspectorWidth;
}
