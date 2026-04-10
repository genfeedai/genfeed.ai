'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

type WorkflowNodeButtonVariant = 'primary' | 'success' | 'danger' | 'ghost';

interface NodeButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: WorkflowNodeButtonVariant;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<WorkflowNodeButtonVariant, string> = {
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-muted text-foreground hover:bg-muted/80',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  success: 'bg-green-600 text-white hover:bg-green-700',
};

/**
 * Standardized button component for workflow nodes
 */
export function NodeButton({
  variant = 'primary',
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: NodeButtonProps): React.JSX.Element {
  return (
    <Button
      className={cn(
        'py-2 text-sm font-black transition flex items-center justify-center gap-2',
        variantClasses[variant],
        fullWidth ? 'w-full' : 'px-3',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      disabled={disabled}
      variant={ButtonVariant.UNSTYLED}
      {...props}
    >
      {icon}
      {children}
    </Button>
  );
}

/**
 * Small icon-only button for actions like copy, refresh
 */
export function NodeIconButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <Button
      className={cn('p-1.5 hover:bg-muted transition flex-shrink-0', className)}
      variant={ButtonVariant.UNSTYLED}
      {...props}
    >
      {children}
    </Button>
  );
}
