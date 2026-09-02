'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { BatchExecution } from '@/features/workflows/services/workflow-api';

type Props = {
  activeBatchStatus: BatchExecution | null;
  onBackToComposer: () => void;
};

export default function BatchPageHeader({
  activeBatchStatus,
  onBackToComposer,
}: Props) {
  return (
    <>
      <h1 className="sr-only">Batch Workflow Runner</h1>
      {activeBatchStatus ? (
        <div className="flex justify-end px-6 pt-4">
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={onBackToComposer}
            className="rounded-xl"
          >
            New batch
          </Button>
        </div>
      ) : null}
    </>
  );
}
