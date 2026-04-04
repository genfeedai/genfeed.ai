import type { PromptBarContainerProps } from '@props/ui/content/prompt-bar-container.props';
import type { ReactNode } from 'react';

export interface PromptBarSurfaceConfig {
  container: Pick<
    PromptBarContainerProps,
    'className' | 'isVisible' | 'layoutMode' | 'maxWidth' | 'zIndex'
  >;
}

export interface PromptBarSurfaceRendererProps {
  children: ReactNode;
  surface: PromptBarSurfaceConfig;
  topContent?: ReactNode;
}
