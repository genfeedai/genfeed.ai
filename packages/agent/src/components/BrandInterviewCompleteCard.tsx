import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiCheckCircle } from 'react-icons/hi2';

interface BrandInterviewCompleteCardProps {
  action: AgentUiAction;
}

export function BrandInterviewCompleteCard({
  action,
}: BrandInterviewCompleteCardProps): ReactElement {
  const data = action.data ?? {};
  const completenessScore =
    typeof data.completenessScore === 'number' ? data.completenessScore : null;

  return (
    <div className="my-2 border border-emerald-500/20 bg-background p-4">
      <div className="mb-2 flex items-center gap-2">
        <HiCheckCircle className="size-5 text-emerald-600" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Brand Context Complete'}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      {completenessScore !== null ? (
        <div className="border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Brand context completeness
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-600">
            {completenessScore}%
          </p>
        </div>
      ) : null}
    </div>
  );
}
