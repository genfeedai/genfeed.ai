'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

interface SelectableButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
  icon?: React.ReactNode;
}

/**
 * Toggle-style button that shows selected/unselected state
 * Used for multi-select options like platform selection, notification channels
 */
export function SelectableButton({
  selected,
  icon,
  children,
  className,
  ...props
}: SelectableButtonProps): React.JSX.Element {
  return (
    <Button
      className={cn(
        'p-2 border flex items-center gap-1 text-xs transition',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-white/[0.08] hover:bg-muted',
        className,
      )}
      variant={ButtonVariant.UNSTYLED}
      {...props}
    >
      {icon}
      {children}
    </Button>
  );
}
