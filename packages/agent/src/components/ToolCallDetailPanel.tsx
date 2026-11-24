'use client';

import { ButtonSize } from '@genfeedai/contracts';
import { Pre } from '@genfeedai/ui';
import { summarizeAgentToolResult } from '@genfeedai/utils/agent/summarize-agent-tool-result';
import type { StructuredProgressDebugPayload } from '@genfeedai/utils/progress/structured-progress-event.util';
import { CopyButton } from '@ui/buttons/CopyButton';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

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
  const resolvedParameters = parameters ?? debug?.parameters;
  const rawOutput =
    typeof debug?.rawOutput === 'string' && debug.rawOutput.trim().length > 0
      ? debug.rawOutput
      : undefined;
  const readableResult = resultSummary
    ? summarizeAgentToolResult(resultSummary)
    : '';
  const copyValue = useMemo(() => {
    const parts = [error, readableResult, rawOutput]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n\n');

    return parts.length > 0 ? parts : undefined;
  }, [error, rawOutput, readableResult]);

  return (
    <div className="border-t border-border px-2.5 py-2 space-y-2">
      {error && <p className="text-destructive text-xs">{error}</p>}
      {resolvedParameters && Object.keys(resolvedParameters).length > 0 && (
        <div>
          <span className="mb-0.5 block text-2xs font-semibold uppercase tracking-label text-muted-foreground/60">
            Parameters
          </span>
          <Pre variant="ghost" size="xs">
            {JSON.stringify(resolvedParameters, null, 2)}
          </Pre>
        </div>
      )}
      {readableResult && (
        <div>
          <span className="mb-0.5 block text-2xs font-semibold uppercase tracking-label text-muted-foreground/60">
            Result
          </span>
          <Pre variant="ghost" size="xs">
            {readableResult}
          </Pre>
        </div>
      )}
      {rawOutput && (
        <div>
          <span className="mb-0.5 block text-2xs font-semibold uppercase tracking-label text-muted-foreground/60">
            Debug Output
          </span>
          <Pre variant="ghost" size="xs">
            {rawOutput}
          </Pre>
        </div>
      )}
      {copyValue && (
        <div className="flex items-center justify-end pt-1">
          <CopyButton
            copiedLabel="Copied error details"
            label="Copy error details"
            size={ButtonSize.XS}
            tooltipPosition="top"
            value={copyValue}
          />
        </div>
      )}
    </div>
  );
}
