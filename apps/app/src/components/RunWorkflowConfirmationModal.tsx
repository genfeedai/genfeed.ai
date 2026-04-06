'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useExecutionStore } from '@/store/executionStore';
import { useRunWorkflowConfirmationStore } from '@/store/runWorkflowConfirmationStore';

export function RunWorkflowConfirmationModal() {
  const isRunning = useExecutionStore((state) => state.isRunning);
  const isOpen = useRunWorkflowConfirmationStore((state) => state.isOpen);
  const cancel = useRunWorkflowConfirmationStore((state) => state.cancel);
  const confirm = useRunWorkflowConfirmationStore((state) => state.confirm);

  return (
    <Modal
      isOpen={isOpen}
      onClose={cancel}
      title="Run entire workflow?"
      maxWidth="max-w-md"
    >
      <div className="flex flex-col gap-6 px-6 py-5">
        <p className="text-sm text-muted-foreground">
          This will execute all runnable nodes in the current workflow.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={isRunning}>
            Run workflow
          </Button>
        </div>
      </div>
    </Modal>
  );
}
