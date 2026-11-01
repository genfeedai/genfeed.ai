import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { EmptyStateProps } from '@genfeedai/props/ui/feedback/empty-state.props';
import CardIcon from '@ui/card/icon/CardIcon';
import { Button } from '@ui/primitives/button';

export type {
  EmptyStateAction,
  EmptyStateProps,
} from '@genfeedai/props/ui/feedback/empty-state.props';

const SIZE_CLASSES = {
  [CardEmptySize.DEFAULT]: {
    icon: 'size-10',
    root: 'px-6 py-10',
    heading: 'text-sm font-medium text-foreground/70',
  },
  [CardEmptySize.LG]: {
    icon: 'size-14',
    root: 'px-6 py-14',
    heading: 'text-base font-medium text-foreground/80',
  },
  [CardEmptySize.SM]: {
    icon: 'size-8',
    root: 'px-4 py-6',
    heading: 'text-sm font-medium text-foreground/70',
  },
};

/**
 * EmptyState - the one empty-state primitive (no card wrapper). Use it inside
 * a surface that already owns the frame (Card, panel, AppTable, modal body).
 *
 * `size` owns padding and type: `sm` for panels and modals, `default` for
 * pages and tabs, `lg` for full-page empties. Do not restyle it with
 * `className`; that is for layout (width, margin, flex) only.
 */
export function EmptyState({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  actions,
  className,
  size = CardEmptySize.DEFAULT,
}: EmptyStateProps) {
  return (
    <div
      aria-live="polite"
      data-testid="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-1 text-center',
        SIZE_CLASSES[size].root,
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

      <h2 className={SIZE_CLASSES[size].heading}>{title}</h2>

      {description && (
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      )}

      {actions || action ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actions ? (
            actions
          ) : action ? (
            <Button
              withWrapper={false}
              variant={action.variant || ButtonVariant.GHOST}
              onClick={action.onClick}
              ariaLabel={action.ariaLabel || action.label}
              className="h-8 text-xs"
            >
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * EmptyStateCard - standalone page/region empty with its own card chrome.
 * Never nest inside another Card or AppTable (those already provide a shell);
 * use bare `EmptyState` when the host already owns the surface.
 */
export function EmptyStateCard({ className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative min-h-[12rem] w-full overflow-hidden rounded-card bg-card text-card-foreground shadow-border',
        className,
      )}
      data-testid="empty-state-card"
    >
      <EmptyState {...props} className="min-h-[12rem] w-full" />
    </div>
  );
}
