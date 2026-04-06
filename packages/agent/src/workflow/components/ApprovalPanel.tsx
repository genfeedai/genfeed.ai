import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import { Check, MessageSquare, ShieldCheck } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useAgentWorkflowStore } from '../store';
import { ApproachCard } from './ApproachCard';

function ApprovalPanelInner() {
  const approaches = useAgentWorkflowStore((s) => s.approaches);
  const selectedApproachId = useAgentWorkflowStore((s) => s.selectedApproachId);
  const selectApproach = useAgentWorkflowStore((s) => s.selectApproach);
  const approveApproach = useAgentWorkflowStore((s) => s.approveApproach);
  const addMessage = useAgentWorkflowStore((s) => s.addMessage);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);

  const selectedApproach = approaches.find((a) => a.id === selectedApproachId);

  const handleApprove = useCallback(() => {
    if (selectedApproach) {
      addMessage('user', `Approved approach: "${selectedApproach.title}"`);
      approveApproach();
    }
  }, [selectedApproach, addMessage, approveApproach]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="size-5 text-blue-400" />
        <h2 className="text-sm font-semibold text-white/90">
          Select & approve an approach
        </h2>
      </div>

      <div className="space-y-3">
        {approaches.map((approach) => (
          <ApproachCard
            key={approach.id}
            approach={approach}
            isSelected={approach.id === selectedApproachId}
            onSelect={selectApproach}
            disabled={isLocked}
          />
        ))}
      </div>

      {selectedApproach && (
        <div className="flex items-center gap-3 pt-2 border-t border-white/10">
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={handleApprove}
            isDisabled={isLocked}
            className={cn(
              'inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all',
              'bg-emerald-500 text-white hover:bg-emerald-400',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <Check className="size-4" />
            Approve & proceed
          </Button>
          <Button
            variant={ButtonVariant.GHOST}
            onClick={() =>
              addMessage(
                'user',
                'Requesting changes to the proposed approaches.',
              )
            }
            isDisabled={isLocked}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/60 hover:text-white/80"
          >
            <MessageSquare className="size-4" />
            Request changes
          </Button>
        </div>
      )}
    </div>
  );
}

export const ApprovalPanel = memo(ApprovalPanelInner);
