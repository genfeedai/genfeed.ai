import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Clipboard, RefreshCw, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

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
}: AgentChatMessageFooterProps): ReactElement | null {
  const showUserActions = isUser && Boolean(onCopy || onRetry);
  const showAssistantActions = !isUser && shouldShowAssistantActions;
  // Assistant duration lives on TimelineWorkGroup *after* the answer.
  // User footer: wall-clock + copy/retry. Assistant footer: actions only.
  if (
    !showUserActions &&
    !showAssistantActions &&
    !(isUser && metaItems.length)
  ) {
    return null;
  }

  const actionButtons = (
    <div
      className={cn(
        'flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
        // Touch has no hover affordance, so actions remain discoverable there.
        '[@media(hover:none)]:opacity-100',
      )}
    >
      {onCopy ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy || copyContent.length === 0}
          tooltip="Copy"
          tooltipPosition="top"
          ariaLabel="Copy message"
          onClick={() => onCopy(copyContent)}
        >
          <Clipboard className="size-3.5" />
        </Button>
      ) : null}
      {onRetry ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy}
          tooltip="Retry"
          tooltipPosition="top"
          ariaLabel="Retry message"
          onClick={() => onRetry(message)}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      ) : null}
      {!isUser && onRemember ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy}
          tooltip="Remember this message"
          tooltipPosition="top"
          ariaLabel="Remember message"
          onClick={() => onRemember(message)}
        >
          <Sparkles className="size-3.5 text-primary" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 text-2xs',
        isUser ? 'mt-1' : 'mt-2.5',
      )}
    >
      {isUser ? (
        <div className="flex min-w-0 items-center gap-1.5 text-foreground/38">
          {metaItems.map((item, index) => (
            <span key={`${item}-${index}`} className="inline-flex items-center">
              {index > 0 ? (
                <span className="mr-1.5 text-foreground/30">•</span>
              ) : null}
              {index === 0 ? <time>{item}</time> : item}
            </span>
          ))}
        </div>
      ) : (
        <div />
      )}

      {showUserActions || showAssistantActions ? (
        <div className="ml-auto shrink-0">{actionButtons}</div>
      ) : null}
    </div>
  );
}
