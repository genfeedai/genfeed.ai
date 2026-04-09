'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import type { StructuredProgressDebugPayload } from '@genfeedai/utils/progress/structured-progress-event.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { HiOutlineCheck, HiOutlineClipboardDocument } from 'react-icons/hi2';

interface ToolCallDetailPanelProps {
  debug?: StructuredProgressDebugPayload;
  error?: string;
  parameters?: Record<string, unknown>;
  resultSummary?: string;
}

export function ToolCallDetailPanel({
  debug,
  error,
  parameters,
  resultSummary,
}: ToolCallDetailPanelProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const resolvedParameters = parameters ?? debug?.parameters;
  const rawOutput =
    typeof debug?.rawOutput === 'string' && debug.rawOutput.trim().length > 0
      ? debug.rawOutput
      : undefined;
  const copyValue = useMemo(() => {
    const parts = [error, resultSummary, rawOutput]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n\n');

    return parts.length > 0 ? parts : undefined;
  }, [error, rawOutput, resultSummary]);

  const handleCopy = async (): Promise<void> => {
    if (!copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="border-t border-border px-2.5 py-2 space-y-2">
      {error && <p className="text-destructive text-xs">{error}</p>}
      {resolvedParameters && Object.keys(resolvedParameters).length > 0 && (
        <div>
          <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Parameters
          </span>
          <Pre variant="ghost" size="xs">
            {JSON.stringify(resolvedParameters, null, 2)}
          </Pre>
        </div>
      )}
      {resultSummary && (
        <div>
          <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Result
          </span>
          <Pre variant="ghost" size="xs">
            {resultSummary}
          </Pre>
        </div>
      )}
      {rawOutput && (
        <div>
          <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Debug Output
          </span>
          <Pre variant="ghost" size="xs">
            {rawOutput}
          </Pre>
        </div>
      )}
      {copyValue && (
        <div className="flex items-center justify-end pt-1">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            tooltip={copied ? 'Copied' : 'Copy error details'}
            tooltipPosition="top"
            ariaLabel={copied ? 'Copied error details' : 'Copy error details'}
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <HiOutlineCheck className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
