import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Archive, ArchiveX, Ellipsis, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

interface AgentThreadListHeaderActionsProps {
  viewStatus: AgentThreadStatus;
  threadCount: number;
  onArchiveAll: () => void;
  onRefresh: () => void;
  onToggleView: () => void;
}

export function AgentThreadListHeaderActions({
  viewStatus,
  threadCount,
  onArchiveAll,
  onRefresh,
  onToggleView,
}: AgentThreadListHeaderActionsProps): ReactElement {
  const isArchivedView = viewStatus === AgentThreadStatus.ARCHIVED;
  const toggleButtonLabel = isArchivedView ? 'Recent' : 'Archived';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          withWrapper={false}
          ariaLabel="Conversation list actions"
          textTransform="none"
          className="size-7 rounded-md text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/80"
        >
          <Ellipsis className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {!isArchivedView ? (
          <DropdownMenuItem
            onSelect={() => {
              onRefresh();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </DropdownMenuItem>
        ) : null}
        {!isArchivedView && threadCount > 0 ? (
          <DropdownMenuItem
            onSelect={() => {
              onArchiveAll();
            }}
          >
            <ArchiveX className="size-4" />
            Archive all
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            onToggleView();
          }}
        >
          <Archive className="size-4" />
          {toggleButtonLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
