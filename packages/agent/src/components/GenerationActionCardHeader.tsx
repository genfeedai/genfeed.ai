import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
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
        <AgentCardCollapseToggle
          isCollapsed={isCollapsed}
          labelCollapse="Collapse generation card"
          labelExpand="Expand generation card"
          onToggle={onToggleCollapsed}
        />
      ) : null}
    </div>
  );
}
