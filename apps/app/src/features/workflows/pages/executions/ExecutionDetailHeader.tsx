'use client';

import { ButtonVariant, WorkflowExecutionStatus } from '@genfeedai/enums';
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
    <header className="border-b border-white/[0.08] bg-card px-6 py-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={executionsHref} className="hover:text-foreground">
            Executions
          </Link>
          <span>/</span>
          <span>{runId.slice(0, 8)}...</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{workflowLabel}</h1>
            <p className="text-sm text-muted-foreground">Run ID: {runId}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={workflowHref}
              className=" border border-white/[0.08] px-4 py-2 hover:bg-accent"
            >
              View Workflow
            </Link>
            {status === WorkflowExecutionStatus.FAILED && (
              <Button variant={ButtonVariant.DEFAULT}>Resume Execution</Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
