import { ToolCallDetailPanel } from '@genfeedai/agent/components/ToolCallDetailPanel';
import type { AgentToolCall } from '@genfeedai/agent/models/agent-chat.model';
import { formatDuration } from '@genfeedai/agent/utils/format-duration';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useState } from 'react';
import { TOOL_LABELS } from './agent-tool-call-display.helpers';

interface AgentToolCallDisplayProps {
  toolCall: AgentToolCall & {
    creditsUsed?: number;
    durationMs?: number;
  };
}

export function AgentToolCallDisplay({
  toolCall,
}: AgentToolCallDisplayProps): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';

  return (
    <div className="my-1.5 border border-border bg-muted/50 text-xs">
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {/* Status icon */}
        <span className="shrink-0">
          {isCompleted && (
            <svg
              aria-hidden="true"
              focusable="false"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-500"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {isFailed && (
            <svg
              aria-hidden="true"
              focusable="false"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {!isCompleted && !isFailed && (
            <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </span>

        {/* Tool name */}
        <span className="font-medium text-foreground">{label}</span>

        {/* Status text */}
        <span
          className={
            isCompleted
              ? 'text-green-600'
              : isFailed
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Running'}
        </span>

        {/* Credits */}
        {toolCall.creditsUsed != null && toolCall.creditsUsed > 0 && (
          <span className="text-muted-foreground">
            {toolCall.creditsUsed} cr
          </span>
        )}

        {/* Duration */}
        {toolCall.durationMs != null && (
          <span className="text-muted-foreground">
            {formatDuration(toolCall.durationMs)}
          </span>
        )}

        {/* Expand chevron */}
        <svg
          aria-hidden="true"
          focusable="false"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-auto shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Button>

      {/* Expanded details */}
      {isExpanded && (
        <ToolCallDetailPanel
          error={toolCall.error}
          parameters={
            Object.keys(toolCall.arguments).length > 0
              ? toolCall.arguments
              : undefined
          }
          resultSummary={toolCall.resultSummary}
        />
      )}
    </div>
  );
}
