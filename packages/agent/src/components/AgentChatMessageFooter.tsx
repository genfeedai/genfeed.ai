import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

type AgentChatMessageFooterProps = {
  isUser: boolean;
  /** Wall-clock label, e.g. "14:37". */
  time: string;
  /** ISO timestamp behind the label. */
  dateTime: string;
  shouldShowAssistantActions: boolean;
  isBusy: boolean;
  copyContent: string;
  message: AgentChatMessage;
  onCopy?: (content: string) => void | Promise<void>;
  onRetry?: (message: AgentChatMessage) => void | Promise<void>;
  onRemember?: (message: AgentChatMessage) => void;
};

const ACTION_ICON_CLASS = 'size-3.5';

/**
 * The quiet row under a message, as in Claude desktop: its time and its
 * actions on one line, attached to the message (right under a user bubble,
 * left under an assistant reply). It shows while the message is hovered or
 * focused, and always on touch. The row keeps its height when hidden, so
 * hovering never shifts the transcript.
 */
export function AgentChatMessageFooter({
  isUser,
  time,
  dateTime,
  shouldShowAssistantActions,
  isBusy,
  copyContent,
  message,
  onCopy,
  onRetry,
  onRemember,
}: AgentChatMessageFooterProps): ReactElement {
  const canAct = isUser || shouldShowAssistantActions;
  const hasCopy = canAct && Boolean(onCopy);
  const hasRetry = canAct && Boolean(onRetry);
  const hasRemember = !isUser && shouldShowAssistantActions && onRemember;

  return (
    <div
      className={cn(
        'flex h-7 items-center gap-0.5 text-xs text-muted-foreground transition-opacity',
        isUser ? 'flex-row-reverse self-end' : 'self-start',
        hoverRevealClassName({ focus: 'group' }),
      )}
      data-testid="agent-message-footer"
    >
      <time className="px-1.5 tabular-nums" dateTime={dateTime}>
        {time}
      </time>
      {hasCopy && onCopy ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy || copyContent.length === 0}
          tooltip="Copy"
          tooltipPosition="bottom"
          ariaLabel="Copy message"
          onClick={() => onCopy(copyContent)}
        >
          <Copy className={ACTION_ICON_CLASS} />
        </Button>
      ) : null}
      {hasRetry && onRetry ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy}
          tooltip="Retry"
          tooltipPosition="bottom"
          ariaLabel="Retry message"
          onClick={() => onRetry(message)}
        >
          <RefreshCw className={ACTION_ICON_CLASS} />
        </Button>
      ) : null}
      {hasRemember ? (
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          isDisabled={isBusy}
          tooltip="Remember this message"
          tooltipPosition="bottom"
          ariaLabel="Remember message"
          onClick={() => onRemember(message)}
        >
          <Sparkles className={ACTION_ICON_CLASS} />
        </Button>
      ) : null}
    </div>
  );
}
