'use client';

import { ButtonVariant, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

type Props = {
  runId: string;
  workflowLabel: string;
  status: WorkflowExecutionStatus;
  executionsHref: string;
  workflowHref: string;
};

export default function ExecutionDetailHeader({
  runId,
  workflowLabel,
  status,
  executionsHref,
  workflowHref,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-4 px-6 pt-4">
      <h1 className="sr-only">
        {workflowLabel} execution {runId}
      </h1>
      <Link
        href={executionsHref}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        All executions
      </Link>
      <Link
        href={workflowHref}
        className="border border-border px-4 py-2 hover:bg-accent"
      >
        View Workflow
      </Link>
      {status === WorkflowExecutionStatus.FAILED && (
        <Button variant={ButtonVariant.DEFAULT}>Resume Execution</Button>
      )}
    </div>
  );
}
