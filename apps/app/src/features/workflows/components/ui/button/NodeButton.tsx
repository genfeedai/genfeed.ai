'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';

type WorkflowNodeButtonVariant = 'primary' | 'success' | 'danger' | 'ghost';

interface NodeButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: WorkflowNodeButtonVariant;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const NODE_BUTTON_VARIANT: Record<WorkflowNodeButtonVariant, ButtonVariant> = {
  danger: ButtonVariant.DESTRUCTIVE,
  ghost: ButtonVariant.GHOST,
  primary: ButtonVariant.SECONDARY,
  success: ButtonVariant.SECONDARY,
};

/**
 * Workflow-node actions use the shared Button primitive, not a custom paint.
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
      className={cn(fullWidth && 'w-full', className)}
      icon={icon}
      isDisabled={disabled}
      size={ButtonSize.SM}
      textTransform="none"
      variant={NODE_BUTTON_VARIANT[variant]}
      withWrapper={false}
      {...props}
    >
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
  title,
  'aria-label': ariaLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <Button
      ariaLabel={ariaLabel ?? title}
      className={cn('p-1.5 hover:bg-muted transition flex-shrink-0', className)}
      textTransform="none"
      title={title}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      {...props}
    >
      {children}
    </Button>
  );
}
