import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CardEmptyProps } from '@genfeedai/props/ui/cards/card-empty.props';
import CardIcon from '@ui/card/icon/CardIcon';
import { Button } from '@ui/primitives/button';

const SIZE_CLASSES = {
  [CardEmptySize.DEFAULT]: {
    icon: 'size-10',
    title: 'text-sm font-medium text-foreground/70',
  },
  [CardEmptySize.LG]: {
    icon: 'size-14',
    title: 'text-base font-medium text-foreground/75',
  },
  [CardEmptySize.SM]: {
    icon: 'size-8',
    title: 'text-sm font-medium text-foreground/70',
  },
};

/**
 * CardEmptyContent - Empty state content without card wrapper
 */
export function CardEmptyContent({
  icon: Icon,
  iconClassName,
  label,
  action,
  actions,
  className,
  size = CardEmptySize.DEFAULT,
}: CardEmptyProps) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <CardIcon
          icon={Icon}
          className="mb-3 rounded-full p-2.5 ring-1 ring-inset ring-border/60"
          iconClassName={cn(
            'text-muted-foreground',
            SIZE_CLASSES[size].icon,
            iconClassName,
          )}
        />
      )}

      {label && <h2 className={cn(SIZE_CLASSES[size].title)}>{label}</h2>}

      {actions
        ? actions
        : action && (
            <Button
              withWrapper={false}
              variant={action.variant || ButtonVariant.GHOST}
              onClick={action.onClick}
              ariaLabel={action.ariaLabel || action.label}
              className="mt-1 h-8 text-xs"
            >
              {action.label}
            </Button>
          )}
    </div>
  );
}

/**
 * CardEmpty — standalone page/region empty with its own card chrome.
 * Never nest inside another Card or AppTable (those already provide a shell).
 * Use `CardEmptyContent` when the host already owns the surface.
 */
export default function CardEmpty({
  icon,
  iconClassName,
  label,
  action,
  actions,
  className,
  size = CardEmptySize.DEFAULT,
}: CardEmptyProps) {
  return (
    <div
      className={cn(
        'relative min-h-[12rem] w-full overflow-hidden rounded-card bg-card text-card-foreground shadow-border',
        className,
      )}
      data-testid="card-empty"
    >
      <CardEmptyContent
        icon={icon}
        iconClassName={iconClassName}
        label={label}
        action={action}
        actions={actions}
        className="min-h-[12rem] w-full"
        size={size}
      />
    </div>
  );
}
