import { Zap } from 'lucide-react';
import type { ReactElement } from 'react';

type WorkflowExecuteCardHeaderProps = {
  title: string;
};

export function WorkflowExecuteCardHeader({
  title,
}: WorkflowExecuteCardHeaderProps): ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Zap className="size-4 text-primary" />
      <span className="text-sm font-medium text-foreground">{title}</span>
    </div>
  );
}
