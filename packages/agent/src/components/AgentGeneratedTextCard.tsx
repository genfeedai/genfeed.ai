import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Clipboard, Download, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

interface AgentGeneratedTextCardProps {
  content: string;
  title?: string;
  onCopy?: (content: string) => void | Promise<void>;
  onInsert?: (content: string) => void | Promise<void>;
  onRegenerate?: () => void | Promise<void>;
  isBusy?: boolean;
  className?: string;
  contentClassName?: string;
}

export function AgentGeneratedTextCard({
  content,
  title,
  onCopy,
  onInsert,
  onRegenerate,
  isBusy = false,
  className,
  contentClassName,
}: AgentGeneratedTextCardProps): ReactElement {
  const hasActions = Boolean(onCopy || onInsert || onRegenerate);

  return (
    <div
      className={cn(
        'group mt-2 overflow-hidden border border-foreground/[0.12] bg-gradient-to-b from-white/[0.04] to-white/[0.02]',
        className,
      )}
    >
      {(title || hasActions) && (
        <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.08] px-3 py-2">
          <p className="truncate text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {title || 'Generated Content'}
          </p>
          {hasActions && (
            <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {onCopy && (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy}
                  tooltip="Copy"
                  tooltipPosition="top"
                  ariaLabel="Copy generated content"
                  onClick={() => onCopy(content)}
                >
                  <Clipboard className="size-3.5" />
                </Button>
              )}
              {onInsert && (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy}
                  tooltip="Use in draft"
                  tooltipPosition="top"
                  ariaLabel="Use generated content in draft"
                  onClick={() => onInsert(content)}
                >
                  <Download className="size-3.5" />
                </Button>
              )}
              {onRegenerate && (
                <Button
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  isDisabled={isBusy}
                  tooltip="Regenerate"
                  tooltipPosition="top"
                  ariaLabel="Regenerate content"
                  onClick={() => onRegenerate()}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <div className={cn('px-3 py-3', contentClassName)}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {content}
        </p>
      </div>
    </div>
  );
}
