'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { QuickActionsMenuProps } from '@genfeedai/props/content/quick-actions.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  QUICK_ACTION_TRIGGER_CLASS,
  QUICK_ACTION_TRIGGER_SIZE_CLASS,
} from '@ui/quick-actions/quick-actions.constants';
import { EllipsisVertical } from 'lucide-react';

const SIZE_CLASSES = {
  [ComponentSize.LG]: ButtonSize.LG,
  [ComponentSize.MD]: ButtonSize.DEFAULT,
  [ComponentSize.SM]: ButtonSize.SM,
} as const;

export default function QuickActionsMenu({
  actions,
  isMenuOpen,
  setIsMenuOpen,
  size = ComponentSize.SM,
  onActionClick,
  triggerClassName,
}: QuickActionsMenuProps): React.ReactNode {
  if (actions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          tooltip="More"
          tooltipPosition="top"
          size={SIZE_CLASSES[size]}
          className={cn(
            QUICK_ACTION_TRIGGER_CLASS,
            triggerClassName ?? QUICK_ACTION_TRIGGER_SIZE_CLASS,
            'text-muted-foreground hover:bg-hover hover:text-foreground',
          )}
          ariaLabel="More"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        data-testid="quick-actions-menu"
        className="min-w-40"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {actions.map((action, index) => (
          <div key={action.id}>
            {action.dividerBefore && index > 0 && <DropdownMenuSeparator />}
            {action.sectionLabel && (
              <DropdownMenuLabel>{action.sectionLabel}</DropdownMenuLabel>
            )}

            <DropdownMenuItem
              disabled={action.isDisabled || action.isLoading}
              onSelect={() => onActionClick(action)}
              className={cn(
                'text-xs font-medium',
                action.isDisabled || action.isLoading
                  ? 'text-muted-foreground opacity-50'
                  : action.variant === 'error'
                    ? 'text-error hover:bg-error hover:text-destructive-foreground focus:bg-error focus:text-destructive-foreground'
                    : 'text-foreground',
              )}
            >
              {action.isLoading && (
                <Spinner size={ComponentSize.XS} className="flex-shrink-0" />
              )}
              {action.icon && (
                <span
                  className={cn(
                    'flex-shrink-0',
                    action.variant === 'error'
                      ? 'text-error/70'
                      : 'text-muted-foreground',
                  )}
                >
                  {action.icon}
                </span>
              )}
              <span className="flex-1 text-left">{action.label}</span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
