import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import type { ReactElement } from 'react';
import { HiOutlineArrowPath, HiOutlineClipboard } from 'react-icons/hi2';

interface AgentGeneratedTextCardProps {
  content: string;
  title?: string;
  onCopy?: (content: string) => void | Promise<void>;
  onRegenerate?: () => void | Promise<void>;
  isBusy?: boolean;
  className?: string;
  contentClassName?: string;
}

export function AgentGeneratedTextCard({
  content,
  title,
  onCopy,
  onRegenerate,
  isBusy = false,
  className,
  contentClassName,
}: AgentGeneratedTextCardProps): ReactElement {
  const hasActions = Boolean(onCopy || onRegenerate);

  return (
    <div
      className={cn(
        'group mt-2 overflow-hidden rounded-xl border border-white/[0.12] bg-gradient-to-b from-white/[0.04] to-white/[0.02]',
        className,
      )}
    >
      {(title || hasActions) && (
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
                  <HiOutlineClipboard className="h-3.5 w-3.5" />
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
                  <HiOutlineArrowPath className="h-3.5 w-3.5" />
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
