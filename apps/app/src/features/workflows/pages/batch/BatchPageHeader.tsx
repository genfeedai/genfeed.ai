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
    <header className="border-b border-white/8 bg-card px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Batch Workflow Runner
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload images, run one workflow across all of them, and return to
            any batch job later.
          </p>
        </div>

        {activeBatchStatus && (
          <Button
            variant={ButtonVariant.OUTLINE}
            onClick={onBackToComposer}
            className="rounded-xl"
          >
            New batch
          </Button>
        )}
      </div>
    </header>
  );
}
