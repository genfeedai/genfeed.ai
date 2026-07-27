'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { BatchJobStatus } from '@/features/workflows/services/workflow-api';

type Props = {
  activeBatchStatus: BatchJobStatus | null;
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
            variant={ButtonVariant.OUTLINE}
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
