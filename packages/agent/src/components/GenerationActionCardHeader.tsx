import { ButtonVariant } from '@genfeedai/enums';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';

type GenerationActionCardHeaderProps = {
  Icon: IconType;
  title: string;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  statusLabel?: string | null;
};

export function GenerationActionCardHeader({
  Icon,
  title,
  isCollapsed = false,
  onToggleCollapsed,
  statusLabel,
}: GenerationActionCardHeaderProps): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border px-3 py-2',
        isCollapsed && 'border-b-0',
      )}
    >
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </span>
      {statusLabel ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {statusLabel}
        </span>
      ) : null}
      {onToggleCollapsed ? (
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed ? 'Expand generation card' : 'Collapse generation card'
          }
          onClick={onToggleCollapsed}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              isCollapsed ? '-rotate-90' : 'rotate-0',
            )}
          />
        </Button>
      ) : null}
    </div>
  );
}
