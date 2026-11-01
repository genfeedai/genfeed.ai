import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { CircleCheck } from 'lucide-react';
import type { ReactElement } from 'react';

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
    <div className="my-2 border border-success/20 bg-background p-4">
      <div className="mb-2 flex items-center gap-2">
        <CircleCheck className="size-5 text-success" />
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
        <Alert icon={false} size="sm" variant="success">
          <AlertTitle>Brand context completeness</AlertTitle>
          <AlertDescription>{completenessScore}%</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
