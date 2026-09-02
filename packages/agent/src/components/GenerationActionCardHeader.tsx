import { AgentCardCollapseToggle } from '@genfeedai/agent/components/AgentCardCollapseToggle';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Square } from 'lucide-react';
import type { ReactElement } from 'react';

type GenerationActionCardHeaderProps = {
  Icon: IconType;
  title: string;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  onStop?: () => void;
  statusLabel?: string | null;
};

export function GenerationActionCardHeader({
  Icon,
  title,
  isCollapsed = false,
  onToggleCollapsed,
  onStop,
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
        <span className="shrink-0 text-2xs text-muted-foreground">
          {statusLabel}
        </span>
      ) : null}
      {onStop ? (
        <Button
          ariaLabel="Stop generation"
          className="size-7 p-0"
          icon={
            <Square aria-hidden className="size-2.5 fill-current stroke-none" />
          }
          onClick={onStop}
          size={ButtonSize.ICON}
          tooltip="Stop"
          variant={ButtonVariant.DESTRUCTIVE}
          withWrapper={false}
        />
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
