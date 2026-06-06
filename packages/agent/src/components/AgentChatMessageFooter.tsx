import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineClipboard,
  HiOutlineClock,
  HiSparkles,
} from 'react-icons/hi2';

type AgentChatMessageFooterProps = {
  isUser: boolean;
  metaItems: string[];
  shouldShowAssistantActions: boolean;
  isBusy: boolean;
  copyContent: string;
  message: AgentChatMessage;
  onCopy?: (content: string) => void | Promise<void>;
  onRetry?: (message: AgentChatMessage) => void | Promise<void>;
  onRemember?: (message: AgentChatMessage) => void;
};

export function AgentChatMessageFooter({
  isUser,
  metaItems,
  shouldShowAssistantActions,
  isBusy,
  copyContent,
  message,
  onCopy,
  onRetry,
  onRemember,
}: AgentChatMessageFooterProps): ReactElement {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
      <div
        className={cn(
          'flex items-center gap-1.5',
          isUser ? 'text-foreground/38' : 'text-foreground/42',
        )}
      >
        {!isUser && <HiOutlineClock className="size-3" />}
        {metaItems.map((item, index) => (
          <span key={`${item}-${index}`} className="inline-flex items-center">
            {index > 0 ? (
              <span className="mr-1.5 text-foreground/30">•</span>
            ) : null}
            {index === 0 ? <time>{item}</time> : item}
          </span>
        ))}
      </div>
      {!isUser && shouldShowAssistantActions ? (
        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {shouldShowAssistantActions && onCopy ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              isDisabled={isBusy || copyContent.length === 0}
              tooltip="Copy"
              tooltipPosition="top"
              ariaLabel="Copy message"
              onClick={() => onCopy(copyContent)}
            >
              <HiOutlineClipboard className="size-3.5" />
            </Button>
          ) : null}
          {shouldShowAssistantActions && onRetry ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              isDisabled={isBusy}
              tooltip="Retry"
              tooltipPosition="top"
              ariaLabel="Retry message"
              onClick={() => onRetry(message)}
            >
              <HiOutlineArrowPath className="size-3.5" />
            </Button>
          ) : null}
          {shouldShowAssistantActions && onRemember ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              isDisabled={isBusy}
              tooltip="Remember this message"
              tooltipPosition="top"
              ariaLabel="Remember message"
              onClick={() => onRemember(message)}
            >
              <HiSparkles className="size-3.5 text-purple-300" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
