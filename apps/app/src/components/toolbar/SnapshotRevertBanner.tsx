'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Undo2, X } from 'lucide-react';
import { memo } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

function SnapshotRevertBannerComponent() {
  const previousWorkflowSnapshot = useWorkflowStore(
    (state) => state.previousWorkflowSnapshot,
  );
  const revertToSnapshot = useWorkflowStore((state) => state.revertToSnapshot);
  const clearSnapshot = useWorkflowStore((state) => state.clearSnapshot);

  if (!previousWorkflowSnapshot) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg shadow-xl animate-in slide-in-from-bottom-4">
      <Undo2 className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">
        AI made changes to your workflow
      </span>
      <Button
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={revertToSnapshot}
        className="h-7 text-xs"
      >
        Revert
      </Button>
      <Button
        onClick={clearSnapshot}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className="p-1 hover:bg-white/20 rounded transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export const SnapshotRevertBanner = memo(SnapshotRevertBannerComponent);
