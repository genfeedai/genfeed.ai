import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IQuickAction } from '@genfeedai/interfaces/ui/quick-actions.interface';
import type { QuickActionButtonProps } from '@genfeedai/props/content/quick-actions.props';
import { Button } from '@ui/primitives/button';
import type { ReactNode } from 'react';

function QuickActionLabel({
  action,
  showLabel,
}: {
  action: IQuickAction;
  showLabel: boolean;
}): ReactNode {
  if (showLabel && action.icon) {
    return (
      <div className="flex items-center gap-2">
        {action.icon}
        <span className="text-xs">{action.label}</span>
      </div>
    );
  }
  return action.icon || action.label;
}

const SIZE_MAP = {
  [ComponentSize.LG]: ButtonSize.LG,
  [ComponentSize.MD]: ButtonSize.DEFAULT,
  [ComponentSize.SM]: ButtonSize.SM,
} as const;

const VARIANT_MAP: Record<string, ButtonVariant> = {
  error: ButtonVariant.DESTRUCTIVE,
  primary: ButtonVariant.DEFAULT,
};

export default function QuickActionButton({
  action,
  size = ComponentSize.SM,
  showLabel = false,
  onClick,
  className,
}: QuickActionButtonProps) {
  const buttonVariant =
    VARIANT_MAP[action.variant ?? ''] ?? ButtonVariant.GHOST;

  const tooltipText = action.tooltip || action.label?.toString();

  return (
    <Button
      data-testid={`quick-action-${action.id}`}
      tooltip={tooltipText}
      tooltipPosition={action.tooltipPosition || 'top'}
      variant={buttonVariant}
      size={SIZE_MAP[size]}
      className={cn(
        'rounded-full transition-all duration-300',
        action.isDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      isDisabled={action.isDisabled}
      isLoading={action.isLoading}
      withWrapper={true}
      onClick={() => onClick(action)}
      label={<QuickActionLabel action={action} showLabel={showLabel} />}
    />
  );
}
