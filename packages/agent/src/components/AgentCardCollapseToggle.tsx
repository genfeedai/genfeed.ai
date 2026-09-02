'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';

export interface AgentCardCollapseToggleProps {
  /**
   * When true the card body is hidden (chevron points down to open).
   * Expanded points up. Vertical only — never left/right.
   */
  isCollapsed: boolean;
  labelCollapse?: string;
  labelExpand?: string;
  onToggle: () => void;
  className?: string;
}

/**
 * Shared expand/collapse control for agent conversation cards.
 * Square hit target with centered chevron — avoids the off-center icon
 * that plain `h-7 w-7 p-0` Button leaves on some variants.
 */
export function AgentCardCollapseToggle({
  isCollapsed,
  labelCollapse = 'Collapse',
  labelExpand = 'Expand',
  onToggle,
  className,
}: AgentCardCollapseToggleProps): ReactElement {
  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      size={ButtonSize.ICON}
      aria-expanded={!isCollapsed}
      ariaLabel={isCollapsed ? labelExpand : labelCollapse}
      onClick={onToggle}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
        'p-0 text-muted-foreground transition-colors',
        'hover:bg-foreground/[0.06] hover:text-foreground',
        className,
      )}
    >
      <ChevronDown
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 transition-transform duration-150',
          isCollapsed ? 'rotate-0' : 'rotate-180',
        )}
      />
    </Button>
  );
}
