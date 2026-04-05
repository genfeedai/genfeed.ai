import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { QuickActionButtonProps } from '@props/content/quick-actions.props';
import Button from '@ui/buttons/base/Button';
import type { ReactNode } from 'react';

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

  const renderLabel = (): ReactNode => {
    if (showLabel && action.icon) {
      return (
        <div className="flex items-center gap-2">
          {action.icon}
          <span className="text-xs">{action.label}</span>
        </div>
      );
    }
    return action.icon || action.label;
  };

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
      label={renderLabel()}
    />
  );
}
