'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';
import PromptBarBody from './PromptBarBody';
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
  type PromptBarShellProps,
} from './PromptBarShell';

export interface PromptBarComposerProps extends PromptBarShellProps {
  beforeBody?: ReactNode;
  bodyClassName?: string;
  density?: 'compact' | 'default';
}

/**
 * Canonical composer surface used by Agent, Studio, and content generation.
 * Placement belongs to PromptBarContainer; this component owns only the glass
 * shell, optional context tray, and editor/toolbar inset. The bar never
 * changes size on its own: it has one height for the whole conversation.
 */
export default function PromptBarComposer({
  banner,
  beforeBody,
  bodyClassName,
  children,
  className,
  density = 'default',
  ...props
}: PromptBarComposerProps) {
  return (
    <PromptBarShell
      data-testid="prompt-bar-composer"
      {...props}
      banner={banner}
      className={cn(PROMPT_BAR_SURFACE_CLASS, className)}
      data-prompt-bar-composer=""
    >
      {beforeBody}
      <PromptBarBody className={bodyClassName} density={density}>
        {children}
      </PromptBarBody>
    </PromptBarShell>
  );
}
