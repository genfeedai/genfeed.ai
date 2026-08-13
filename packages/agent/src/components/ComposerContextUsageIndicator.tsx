import type { ConversationContextUsage } from '@genfeedai/agent/utils/estimate-conversation-context.util';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement } from 'react';

type ComposerContextUsageIndicatorProps = {
  usage: ConversationContextUsage;
};

export function ComposerContextUsageIndicator({
  usage,
}: ComposerContextUsageIndicatorProps): ReactElement | null {
  if (usage.usedTokens <= 0) {
    return null;
  }

  const fillPercent = Math.max(4, Math.round(usage.ratio * 100));

  return (
    <output
      aria-label={`Context used ${usage.label}`}
      className="flex min-w-0 max-w-[7.5rem] items-center gap-1.5 px-1"
      data-testid="composer-context-usage"
      title={`Context ${usage.label}`}
    >
      <span
        aria-hidden="true"
        className="relative h-1 w-10 shrink-0 overflow-hidden rounded-full bg-white/10"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-foreground/55',
            usage.ratio >= 0.85 && 'bg-warning',
          )}
          style={{ width: `${fillPercent}%` }}
        />
      </span>
      <span className="truncate text-[10px] font-medium tabular-nums text-foreground/45">
        {usage.label}
      </span>
    </output>
  );
}
