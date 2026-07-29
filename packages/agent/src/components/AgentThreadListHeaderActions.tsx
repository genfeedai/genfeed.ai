import { AGENT_REFRESH_CONVERSATIONS_EVENT } from '@genfeedai/agent/components/agent-thread-list.helpers';
import { AgentThreadStatus, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import type { ReactElement } from 'react';
import {
  HiArchiveBox,
  HiArrowPath,
  HiOutlineArchiveBoxXMark,
} from 'react-icons/hi2';

interface AgentThreadListHeaderActionsProps {
  viewStatus: AgentThreadStatus;
  threadCount: number;
  onArchiveAll: () => void;
  onToggleView: () => void;
}

export function AgentThreadListHeaderActions({
  viewStatus,
  threadCount,
  onArchiveAll,
  onToggleView,
}: AgentThreadListHeaderActionsProps): ReactElement {
  const isArchivedView = viewStatus === AgentThreadStatus.ARCHIVED;
  const toggleButtonLabel = isArchivedView
    ? 'Show recent threads'
    : 'Show archived threads';

  return (
    <div className="flex items-center gap-0.5">
      {!isArchivedView && (
        <SimpleTooltip label="Refresh conversations" position="bottom">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            withWrapper={false}
            ariaLabel="Refresh conversations"
            textTransform="none"
            className="size-7 rounded-md text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/80"
            onClick={() => {
              window.dispatchEvent(
                new Event(AGENT_REFRESH_CONVERSATIONS_EVENT),
              );
            }}
          >
            <HiArrowPath className="size-3.5" />
          </Button>
        </SimpleTooltip>
      )}
      {!isArchivedView && threadCount > 0 && (
        <SimpleTooltip label="Archive all threads" position="bottom">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            withWrapper={false}
            ariaLabel="Archive all threads"
            textTransform="none"
            className="size-7 rounded-md text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/80"
            onClick={onArchiveAll}
          >
            <HiOutlineArchiveBoxXMark className="size-3.5" />
          </Button>
        </SimpleTooltip>
      )}
      <SimpleTooltip label={toggleButtonLabel} position="bottom">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          withWrapper={false}
          ariaLabel={toggleButtonLabel}
          textTransform="none"
          className="size-7 rounded-md text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/80"
          onClick={onToggleView}
        >
          <HiArchiveBox className="size-3.5" />
        </Button>
      </SimpleTooltip>
    </div>
  );
}
